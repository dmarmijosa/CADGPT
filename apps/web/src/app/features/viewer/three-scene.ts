import {
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { RenderedScene } from './scene-factory';

/**
 * Builds the three.js scene for a parsed STL mesh (design D15; spec
 * mesh-viewer "STL Rendering on Design Route"). This is the only module in
 * the viewer feature that imports `three` — `scene-factory.ts` reaches it
 * only through a dynamic `import()`, so none of this code loads during a
 * server-rendered pass.
 *
 * Rendering is event-driven rather than a continuous requestAnimationFrame
 * loop: `OrbitControls` dispatches `change` on every user interaction, and
 * that is the only trigger besides the initial paint and container resizes.
 * This keeps the viewer idle (no per-frame CPU/GPU cost) while still
 * rendering outside Angular's signal graph.
 */
export function createScene(container: HTMLElement, buffer: ArrayBuffer): RenderedScene {
  const geometry = new STLLoader().parse(buffer);
  geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius || 50;

  const scene = new Scene();

  const material = new MeshStandardMaterial({ color: 0x5b7fa6, roughness: 0.55, metalness: 0.1 });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);

  const grid = new GridHelper(radius * 4, 20, 0x3b82f6, 0x1e293b);
  grid.position.y = -radius;
  scene.add(grid);

  scene.add(new HemisphereLight(0xffffff, 0x444444, 1.2));
  const directional = new DirectionalLight(0xffffff, 1.2);
  directional.position.set(radius * 2, radius * 3, radius * 2);
  scene.add(directional);

  const camera = new PerspectiveCamera(45, 1, radius / 100, radius * 100);
  camera.position.set(radius * 2.2, radius * 1.6, radius * 2.2);
  camera.lookAt(new Vector3(0, 0, 0));

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  // Rendering is on demand (change/resize), so inertia cannot be animated.
  controls.enableDamping = false;
  controls.target.set(0, 0, 0);
  controls.update();

  function render(): void {
    renderer.render(scene, camera);
  }

  function resize(): void {
    const { clientWidth: width, clientHeight: height } = container;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  }

  controls.addEventListener('change', render);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  render();

  return {
    dispose(): void {
      resizeObserver.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
