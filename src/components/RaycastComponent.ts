import * as THREE from 'three';
import { Component } from '../engine/Component';

export class RaycastComponent extends Component {
  readonly raycaster = new THREE.Raycaster();

  /**
   * Converts a browser pointer event into Three.js normalized
   * device coordinates (-1 to +1).
   */
  getPointerPosition(event: PointerEvent): THREE.Vector2 {
    const canvas = this.world.renderer.domElement;

    const rect = canvas.getBoundingClientRect();

    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,

      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }

  /**
   * Creates the ray for a pointer event.
   */
  setFromPointer(event: PointerEvent): void {
    const pointer = this.getPointerPosition(event);

    this.raycaster.setFromCamera(pointer, this.world.camera);
  }

  /**
   * Raycasts against one Three.js object.
   */
  castObject(
    event: PointerEvent,
    object: THREE.Object3D,
    recursive = false,
  ): THREE.Intersection[] {
    this.setFromPointer(event);

    return this.raycaster.intersectObject(object, recursive);
  }

  /**
   * Raycasts against several Three.js objects.
   */
  castObjects(
    event: PointerEvent,
    objects: THREE.Object3D[],
    recursive = false,
  ): THREE.Intersection[] {
    this.setFromPointer(event);

    return this.raycaster.intersectObjects(objects, recursive);
  }

  /**
   * Raycasts against all model meshes registered with the world.
   *
   * This will later be useful for selecting walls.
   */
  castWorldMeshes(event: PointerEvent): THREE.Intersection[] {
    return this.castObjects(event, [...this.world.meshes], false);
  }
}
