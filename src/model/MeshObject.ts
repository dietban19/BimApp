import * as THREE from 'three';

import { SceneObject } from './SceneObject';

/**
 * Base class for any model object that is represented by a single
 * THREE.Mesh in the scene.
 *
 * It centralises:
 *  - ownership of geometry + material (and their disposal)
 *  - selection / hover highlighting behaviour
 *  - a hook (`buildGeometry`) for subclasses to (re)generate their shape
 *
 * Walls, and later slabs / doors / columns, extend this so that every
 * mesh-backed object shares the same lifecycle and interaction surface.
 */
export abstract class MeshObject extends SceneObject {
  /**
   * The renderable mesh. Created lazily by `build()`.
   */
  readonly mesh: THREE.Mesh;

  protected material: THREE.MeshStandardMaterial;

  private hovered = false;

  private selected = false;

  private readonly baseColor: THREE.Color;

  private readonly hoverColor = new THREE.Color(0x4da3ff);

  private readonly selectColor = new THREE.Color(0xffaa00);

  constructor(name?: string, color: THREE.ColorRepresentation = 0xcccccc) {
    super(name);

    this.baseColor = new THREE.Color(color);

    this.material = new THREE.MeshStandardMaterial({
      color: this.baseColor.clone(),
      roughness: 0.9,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);

    /*
     * Back-reference so raycasting against world meshes can resolve the
     * owning model object without a separate lookup table.
     */
    this.mesh.userData.modelObject = this;
  }

  /**
   * Builds (or rebuilds) the geometry from the object's current state.
   * Subclasses provide the actual shape via `buildGeometry`.
   */
  build(): void {
    const geometry = this.buildGeometry();

    const previous = this.mesh.geometry;

    this.mesh.geometry = geometry;

    /*
     * Dispose the geometry we just replaced so rebuilds do not leak.
     */
    if (previous && previous !== geometry) {
      previous.dispose();
    }
  }

  /**
   * Subclasses return the geometry describing their current shape.
   * The mesh's local origin conventions are defined per subclass.
   */
  protected abstract buildGeometry(): THREE.BufferGeometry;

  setHovered(value: boolean): void {
    this.hovered = value;
    this.refreshAppearance();
  }

  setSelected(value: boolean): void {
    this.selected = value;
    this.refreshAppearance();
  }

  isSelected(): boolean {
    return this.selected;
  }

  private refreshAppearance(): void {
    if (this.selected) {
      this.material.color.copy(this.selectColor);
    } else if (this.hovered) {
      this.material.color.copy(this.hoverColor);
    } else {
      this.material.color.copy(this.baseColor);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.userData.modelObject = undefined;
  }
}
