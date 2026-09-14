import { InjectionToken } from '@angular/core';

/** A live three.js exploded-view scene bound to one container element. */
export interface RenderedPlugScene {
  /** Sets explosion progress in [0,1]: 0 is fully assembled, 1 is fully exploded. */
  setProgress(p: number): void;
  dispose(): void;
}

export interface PlugSceneOptions {
  /** When true, the scene renders once, assembled and static — no idle rotation. */
  reducedMotion: boolean;
}

/** Builds an exploded-view scene for a container; kept async so the real
 * implementation can lazy-load `three` and fetch the STL parts without
 * changing this contract. */
export type PlugSceneFactory = (
  container: HTMLElement,
  options: PlugSceneOptions,
) => Promise<RenderedPlugScene> | RenderedPlugScene;

/**
 * Lazy-loads `plug-scene.ts` — the only module that imports `three` and its
 * addons for the exploded-view hero — so bundling and any accidental
 * synchronous import stay isolated to this one function, mirroring
 * `features/viewer/scene-factory.ts` (design D15 precedent). `afterNextRender`
 * plus the `isPlatformBrowser` guard in `exploded-plug.ts` already keep this
 * from running during a server-rendered pass.
 */
export const defaultPlugSceneFactory: PlugSceneFactory = async (container, options) => {
  const { createPlugScene } = await import('./plug-scene');
  return createPlugScene(container, options);
};

/** DI seam so tests can swap in a fake factory and never load real WebGL,
 * `three`, or fetch the STL parts. */
export const PLUG_SCENE_FACTORY = new InjectionToken<PlugSceneFactory>('PLUG_SCENE_FACTORY', {
  factory: () => defaultPlugSceneFactory,
});
