import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { PlugSceneOptions, RenderedPlugScene } from './exploded-scene';

/**
 * Spark plug part manifest — mirrors `apps/web/public/models/sparkplug/parts.json`
 * (produced live by the CAD engine; not modified here). Parts stack along the
 * model's Z axis (FreeCAD Z-up); `zmin`/`zmax` drive both the explode rank
 * (which part is "outer") and the assembled bounding box. Per-part material
 * hints follow the brief: cool steel grey for the metal body parts, an
 * off-white ceramic tone for the insulator, and a warm metal for the
 * electrode tip.
 */
const PARTS: ReadonlyArray<{
  file: string;
  zmin: number;
  zmax: number;
  color: number;
  metalness: number;
  roughness: number;
}> = [
  { file: '1_terrain_roads', zmin: 0, zmax: 2, color: 0x1e293b, metalness: 0.1, roughness: 0.9 },
  { file: '2_houses', zmin: 1.5, zmax: 9.5, color: 0xf8fafc, metalness: 0.05, roughness: 0.65 },
  { file: '3_buildings', zmin: 1.5, zmax: 36, color: 0x38bdf8, metalness: 0.35, roughness: 0.35 },
  {
    file: '4_signals_infrastructure',
    zmin: 1.2,
    zmax: 7.7,
    color: 0xf59e0b,
    metalness: 0.4,
    roughness: 0.4,
  },
  {
    file: '5_roofs_landmarks',
    zmin: 2,
    zmax: 48,
    color: 0x0f172a,
    metalness: 0.6,
    roughness: 0.25,
  },
];

const MODEL_BASE_URL = '/models/citadel';
/** Explode travel per assembly-height unit, at full explosion. */
const GAP_SCALE = 0.55;
/** Exponent on rank distance so upper strata lift gracefully into sky. */
const FAN_EASE = 1.35;

interface PlugPart {
  mesh: Mesh;
  /** World-space Z offset (pre-rotation, i.e. along the model's own axis) at p=1. */
  explodeOffset: number;
}

/**
 * Builds the exploded-view scene (design: home hero centerpiece). The only
 * module in the `exploded` feature that imports `three` — `exploded-scene.ts`
 * reaches it only through a dynamic `import()`, so none of this code, nor the
 * STL fetches below, run during a server-rendered pass or in a test that
 * mocks `PLUG_SCENE_FACTORY`.
 *
 * Rendering is on demand: the caller (`exploded-plug.ts`) drives `setProgress`
 * from a scroll-linked, IntersectionObserver-gated rAF loop rather than this
 * module running its own idle loop, so a container off screen costs nothing.
 */
export async function createPlugScene(
  container: HTMLElement,
  _options: PlugSceneOptions,
): Promise<RenderedPlugScene> {
  const buffers = await Promise.all(
    PARTS.map(async (part) => {
      const response = await fetch(`${MODEL_BASE_URL}/${part.file}.stl`);
      if (!response.ok) throw new Error(`Failed to load ${part.file}.stl (${response.status})`);
      return response.arrayBuffer();
    }),
  );

  const loader = new STLLoader();
  const geometries = buffers.map((buffer) => {
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  });

  // All five parts share one assembled coordinate system from AutoCAD 2026,
  // so centering applies the *same* translation to every geometry — this
  // recenters the assembly without disturbing how the strata stack.
  const overallBounds = new Box3();
  for (const geometry of geometries) {
    if (geometry.boundingBox) overallBounds.union(geometry.boundingBox);
  }
  const center = overallBounds.getCenter(new Vector3());
  for (const geometry of geometries) geometry.translate(-center.x, -center.y, -center.z);

  const totalHeight = overallBounds.max.z - overallBounds.min.z || 1;
  const gapUnit = totalHeight * GAP_SCALE;

  // AutoCAD's Z-up becomes the screen's vertical axis: rotating the group
  // -90° about X maps local +Z to world +Y, so "explode along the assembly
  // axis" reads as strata lifting vertically rather than toward the camera.
  const group = new Group();
  group.rotation.x = -Math.PI / 2;

  // Fixed isometric architectural angle: South-East elevated perspective (strictly no spin)
  group.rotation.y = 0;

  // Architectural Masterplan Explosion:
  // Layer 0 (Terrain/Roads) anchors at ground base (offset 0).
  // Successive strata lift upward into the sky.
  const parts: PlugPart[] = PARTS.map((part, index) => {
    const material = new MeshStandardMaterial({
      color: part.color,
      metalness: part.metalness,
      roughness: part.roughness,
    });
    const mesh = new Mesh(geometries[index], material);
    group.add(mesh);

    const magnitude = index === 0 ? 0 : Math.pow(index, FAN_EASE);
    return { mesh, explodeOffset: magnitude * gapUnit };
  });

  const maxOffset = Math.max(0, ...parts.map((p) => Math.abs(p.explodeOffset)));

  const scene = new Scene();
  scene.add(group);

  scene.add(new HemisphereLight(0xffffff, 0x1e293b, 1.2));
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(totalHeight * 2, totalHeight * 3.5, totalHeight * 2.5);
  scene.add(key);

  const fill = new DirectionalLight(0x38bdf8, 0.5);
  fill.position.set(-totalHeight * 2, totalHeight * 2, -totalHeight * 2);
  scene.add(fill);

  const radiusXY = (overallBounds.max.x - overallBounds.min.x) / 2;
  const radius = Math.max(totalHeight / 2, radiusXY) + maxOffset * 0.7;
  const camera = new PerspectiveCamera(36, 1, radius / 100, radius * 50);
  camera.position.set(radius * 0.95, radius * 0.75, radius * 1.55);
  camera.lookAt(0, maxOffset * 0.22, 0);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

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

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function setProgress(p: number): void {
    const clamped = Math.min(1, Math.max(0, p));
    for (const part of parts) {
      part.mesh.position.z = part.explodeOffset * clamped;
    }
    // Strictly fixed architectural masterplan — no rotation on scroll or idle
    render();
  }

  // Initial paint: p=0, fully assembled (design requirement).
  setProgress(0);

  return {
    setProgress,
    dispose(): void {
      resizeObserver.disconnect();
      for (const part of parts) {
        part.mesh.geometry.dispose();
        (part.mesh.material as MeshStandardMaterial).dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
