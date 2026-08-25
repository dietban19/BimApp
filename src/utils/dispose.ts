import * as THREE from 'three';

function disposeMaterial(
  material: THREE.Material | THREE.Material[] | null | undefined,
  keep?: ReadonlySet<THREE.Material>,
): void {
  if (!material) {
    return;
  }

  const materials = Array.isArray(material) ? material : [material];

  for (const item of materials) {
    if (!keep?.has(item)) {
      item.dispose();
    }
  }
}

/**
 * Releases every GPU resource owned by an object and its descendants.
 *
 * Materials listed in `keep` are shared with something else (for example a
 * ghost material owned by a preview) and are skipped.
 */
export function disposeObject3D(
  object: THREE.Object3D,
  keep?: ReadonlySet<THREE.Material>,
): void {
  object.traverse((child) => {
    const renderable = child as Partial<THREE.Mesh>;

    renderable.geometry?.dispose();

    disposeMaterial(renderable.material, keep);
  });
}
