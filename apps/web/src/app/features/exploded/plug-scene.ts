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
  { file: '1_terminal', zmin: 52, zmax: 60, color: 0x8c9199, metalness: 0.75, roughness: 0.32 },
  { file: '2_insulator', zmin: 22, zmax: 52, color: 0xece6d8, metalness: 0.05, roughness: 0.62 },
  { file: '3_hexbody', zmin: 16, zmax: 26, color: 0x565c63, metalness: 0.7, roughness: 0.35 },
  { file: '4_thread', zmin: 0, zmax: 16, color: 0x9aa1a8, metalness: 0.8, roughness: 0.28 },
  { file: '5_electrode', zmin: -9, zmax: 2, color: 0xb17a45, metalness: 0.55, roughness: 0.4 },
];

const MODEL_BASE_URL = '/models/sparkplug';
/** Radians added to the assembly's spin per `setProgress` call (rAF-cadence). */
const ROTATION_SPEED = 0.0022;
/** Explode travel per assembly-height unit, at full explosion. */
const GAP_SCALE = 0.42;
/** Exponent on rank-distance-from-center so outer parts travel further than
 * a straight linear fan would (design: "outer parts travel a bit more"). */
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
  options: PlugSceneOptions,
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

  // All five parts share one assembled coordinate system (they were exported
  // as one model split into parts), so centering applies the *same*
  // translation to every geometry — this recenters the assembly without
  // disturbing how the parts stack against each other.
  const overallBounds = new Box3();
  for (const geometry of geometries) {
    if (geometry.boundingBox) overallBounds.union(geometry.boundingBox);
  }
  const center = overallBounds.getCenter(new Vector3());
  for (const geometry of geometries) geometry.translate(-center.x, -center.y, -center.z);

  const order = PARTS.map((part, index) => ({ index, mid: (part.zmin + part.zmax) / 2 })).sort(
    (a, b) => a.mid - b.mid,
  );
  const centerRank = (order.length - 1) / 2;
  const rankByIndex = new Map(order.map(({ index }, rank) => [index, rank]));

  const totalHeight = overallBounds.max.z - overallBounds.min.z || 1;
  const gapUnit = totalHeight * GAP_SCALE;

  // FreeCAD's Z-up becomes the screen's vertical axis: rotating the group
  // -90° about X maps local +Z to world +Y, so "explode along the assembly
  // axis" reads as parts fanning vertically rather than toward the camera.
  const group = new Group();
  group.rotation.x = -Math.PI / 2;

  const parts: PlugPart[] = PARTS.map((part, index) => {
    const material = new MeshStandardMaterial({
      color: part.color,
      metalness: part.metalness,
      roughness: part.roughness,
    });
    const mesh = new Mesh(geometries[index], material);
    group.add(mesh);

    const rank = rankByIndex.get(index) ?? centerRank;
    const distance = rank - centerRank;
    const direction = Math.sign(distance);
    const magnitude = Math.pow(Math.abs(distance), FAN_EASE);
    return { mesh, explodeOffset: direction * magnitude * gapUnit };
  });

  const maxOffset = Math.max(0, ...parts.map((p) => Math.abs(p.explodeOffset)));

  const scene = new Scene();
  scene.add(group);

  scene.add(new HemisphereLight(0xffffff, 0x3d4a45, 1.1));
  const key = new DirectionalLight(0xffffff, 1.3);
  key.position.set(totalHeight * 2, totalHeight * 3, totalHeight * 2.5);
  scene.add(key);

  const radiusXY = (overallBounds.max.x - overallBounds.min.x) / 2;
  const radius = Math.max(totalHeight / 2, radiusXY) + maxOffset;
  const camera = new PerspectiveCamera(38, 1, radius / 100, radius * 50);
  camera.position.set(radius * 0.55, radius * 0.15, radius * 2.6);
  camera.lookAt(0, 0, 0);

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
    if (!options.reducedMotion) group.rotation.y += ROTATION_SPEED;
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
