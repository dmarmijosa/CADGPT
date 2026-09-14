import { InjectionToken } from '@angular/core';

/** A live three.js scene bound to one container element. */
export interface RenderedScene {
  dispose(): void;
}

/** Builds a scene for a container + parsed STL buffer; kept async so the real
 * implementation can lazy-load `three` without changing this contract. */
export type SceneFactory = (
  container: HTMLElement,
  mesh: ArrayBuffer,
) => Promise<RenderedScene> | RenderedScene;

/**
 * Lazy-loads `three-scene.ts` — the only module that imports `three` and its
 * addons — so bundling and any accidental synchronous import stay isolated
 * to this one function (design D15; spec mesh-viewer "SSR pass skips
 * three.js"). `afterNextRender` already keeps `stl-viewer.ts` from calling
 * this outside the browser, so this factory never runs during a
 * server-rendered pass.
 */
export const defaultSceneFactory: SceneFactory = async (container, mesh) => {
  const { createScene } = await import('./three-scene');
  return createScene(container, mesh);
};

/** DI seam so tests can swap in a fake factory and never load real WebGL. */
export const SCENE_FACTORY = new InjectionToken<SceneFactory>('SCENE_FACTORY', {
  factory: () => defaultSceneFactory,
});
