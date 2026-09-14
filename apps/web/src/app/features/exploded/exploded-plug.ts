import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { computeExplodeProgress } from './explode-progress';
import { PLUG_SCENE_FACTORY, RenderedPlugScene } from './exploded-scene';

/** Lerp factor applied per animation frame while progress chases its scroll target. */
const LERP_FACTOR = 0.15;
/** Progress at which point the on-canvas part labels fade in. */
const LABELS_VISIBLE_AT = 0.35;

/**
 * Home hero: a scroll-driven exploded view of a spark plug rendered with
 * three.js (design: home/presentation page centerpiece). Scrolling down the
 * hero's tall scroll track separates the plug's five parts along its axis;
 * scrolling back up reassembles them. The heading, value statement, and CTA
 * (projected via `<ng-content>` so this component stays free of
 * `AuthService`) exist as real DOM text, so the page means something with no
 * WebGL at all.
 *
 * Mirrors `features/viewer/stl-viewer.ts`'s DI/SSR-guard pattern: `three` and
 * the STL fetches only ever happen behind the lazily-loaded `PLUG_SCENE_FACTORY`,
 * never eagerly and never on a server-rendered pass.
 */
@Component({
  selector: 'app-exploded-plug',
  templateUrl: './exploded-plug.html',
})
export class ExplodedPlug {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly sceneFactory = inject(PLUG_SCENE_FACTORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly wrapperRef = viewChild.required<ElementRef<HTMLElement>>('wrapper');
  private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

  /** Set when the browser cannot create a WebGL context or the parts fail to load. */
  readonly unavailable = signal(false);
  readonly reducedMotion = signal(false);
  /** Eased explosion progress in [0,1], mirrored to the scene each animated frame. */
  readonly progress = signal(0);
  readonly labelsVisible = computed(() => this.progress() > LABELS_VISIBLE_AT);

  private scene: RenderedPlugScene | undefined;
  private target = 0;
  private rafId: number | undefined;
  private intersectionObserver: IntersectionObserver | undefined;

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.reducedMotion.set(this.prefersReducedMotion());
      void this.mount();
    });
    this.destroyRef.onDestroy(() => this.teardown());
  }

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  private async mount(): Promise<void> {
    try {
      this.scene = await this.sceneFactory(this.containerRef().nativeElement, {
        reducedMotion: this.reducedMotion(),
      });
    } catch {
      // No WebGL (headless, blocked, exhausted contexts) or a part failed to
      // fetch/parse: degrade to the static caption instead of an unhandled
      // rejection (mirrors stl-viewer.ts).
      this.unavailable.set(true);
      return;
    }

    if (this.reducedMotion()) return;
    this.attachScrollTracking();
  }

  /** Maps scroll position within the hero's scroll track to explode progress,
   * then drives an eased rAF loop toward that target — gated so it only runs
   * while the hero is actually on screen (or always, if IntersectionObserver
   * is unavailable), keeping this off the "hot idle loop" the design warns
   * against for a section that can sit far below the fold. */
  private attachScrollTracking(): void {
    const wrapper = this.wrapperRef().nativeElement;

    const updateTarget = (): void => {
      const rect = wrapper.getBoundingClientRect();
      this.target = computeExplodeProgress(rect.top, wrapper.offsetHeight, window.innerHeight);
    };
    updateTarget();

    window.addEventListener('scroll', updateTarget, { passive: true });
    window.addEventListener('resize', updateTarget, { passive: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', updateTarget);
      window.removeEventListener('resize', updateTarget);
    });

    if (typeof IntersectionObserver === 'function') {
      this.intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) this.startLoop();
          else this.stopLoop();
        },
        { threshold: 0 },
      );
      this.intersectionObserver.observe(wrapper);
    } else {
      this.startLoop();
    }
  }

  private startLoop(): void {
    if (this.rafId !== undefined) return;
    const raf: (cb: FrameRequestCallback) => number =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;

    const tick = (): void => {
      const current = this.progress();
      const next = current + (this.target - current) * LERP_FACTOR;
      this.progress.set(next);
      this.scene?.setProgress(next);
      this.rafId = raf(tick);
    };
    this.rafId = raf(tick);
  }

  private stopLoop(): void {
    if (this.rafId === undefined) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
    else clearTimeout(this.rafId);
    this.rafId = undefined;
  }

  private teardown(): void {
    this.stopLoop();
    this.intersectionObserver?.disconnect();
    this.scene?.dispose();
  }
}
