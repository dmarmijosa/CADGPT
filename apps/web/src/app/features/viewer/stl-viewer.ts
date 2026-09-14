import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RenderedScene, SCENE_FACTORY } from './scene-factory';

/**
 * Mounts a container and renders the given STL buffer via a lazily-loaded
 * three.js scene (design D15). The mesh is received as an already-fetched
 * `ArrayBuffer` rather than a URL, because `GET /api/designs/:id/mesh`
 * requires an owner bearer token that a plain `STLLoader.load(url)` call
 * could never attach — the host page fetches the bytes through `ApiService`
 * and passes them in here.
 *
 * `afterNextRender` only runs in the browser by contract, and the explicit
 * `isPlatformBrowser` guard keeps that behavior deterministic and testable
 * (spec mesh-viewer "SSR pass skips three.js"): no scene factory call, and
 * therefore no dynamic `three-scene` import, happens on a server-rendered
 * pass.
 */
@Component({
  selector: 'app-stl-viewer',
  templateUrl: './stl-viewer.html',
})
export class StlViewer {
  readonly mesh = input.required<ArrayBuffer>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly sceneFactory = inject(SCENE_FACTORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

  private scene: RenderedScene | undefined;

  /** Set when the browser cannot create a WebGL context or the STL cannot be parsed. */
  readonly unavailable = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      void this.mount();
    });
    this.destroyRef.onDestroy(() => this.scene?.dispose());
  }

  private async mount(): Promise<void> {
    try {
      this.scene = await this.sceneFactory(this.containerRef().nativeElement, this.mesh());
    } catch {
      // WebGL unavailable (headless, blocked, or exhausted contexts) or a
      // malformed buffer: degrade to a message instead of an unhandled rejection.
      this.unavailable.set(true);
    }
  }
}
