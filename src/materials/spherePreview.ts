import * as THREE from 'three';

/**
 * Unity-style Material Sphere Preview Renderer.
 * Generates crisp 3D sphere thumbnails showing specular highlights, roughness,
 * metalness, transparency, and procedural or uploaded textures.
 */

let previewRenderer: THREE.WebGLRenderer | null = null;
let previewScene: THREE.Scene | null = null;
let previewCamera: THREE.PerspectiveCamera | null = null;
let previewSphere: THREE.Mesh<THREE.SphereGeometry, THREE.Material> | null = null;

const previewCache = new Map<string, string>();

function initPreviewEnvironment(): void {
  if (previewRenderer) return;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;

  previewRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  previewRenderer.setSize(128, 128, false);
  previewRenderer.setPixelRatio(1);
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure = 1.2;

  previewScene = new THREE.Scene();

  previewCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  previewCamera.position.set(0, 0, 3.0);
  previewCamera.lookAt(0, 0, 0);

  // Studio lighting setup (key, fill, rim, ambient)
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(3, 4, 3);
  previewScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
  fillLight.position.set(-3, -1, 1.5);
  previewScene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 1.4);
  rimLight.position.set(-2, 3, -3);
  previewScene.add(rimLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  previewScene.add(ambientLight);

  const geometry = new THREE.SphereGeometry(1, 32, 24);
  const defaultMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  previewSphere = new THREE.Mesh(geometry, defaultMat);
  previewScene.add(previewSphere);
}

/**
 * Generates a Unity-style 3D sphere preview thumbnail as a Data URL for any Three.js Material.
 */
export function generateMaterialSpherePreview(materialId: string, material: THREE.Material): string {
  if (previewCache.has(materialId)) {
    return previewCache.get(materialId)!;
  }

  try {
    initPreviewEnvironment();

    if (!previewRenderer || !previewScene || !previewCamera || !previewSphere) {
      return '';
    }

    previewSphere.material = material;
    previewRenderer.render(previewScene, previewCamera);

    const dataUrl = previewRenderer.domElement.toDataURL('image/png');
    previewCache.set(materialId, dataUrl);
    return dataUrl;
  } catch {
    return '';
  }
}

/**
 * Invalidate cache if a custom material's texture changes.
 */
export function invalidateSpherePreview(materialId: string): void {
  previewCache.delete(materialId);
}

export function disposeSpherePreviewRenderer(): void {
  if (previewRenderer) {
    previewRenderer.dispose();
    previewRenderer = null;
  }
  if (previewSphere) {
    previewSphere.geometry.dispose();
    previewSphere = null;
  }
  previewScene?.clear();
  previewScene = null;
  previewCamera = null;
  previewCache.clear();
}
