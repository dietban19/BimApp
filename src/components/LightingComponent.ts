import * as THREE from 'three';

import { Component } from '../engine/Component';

/**
 * Adds basic lighting so MeshStandardMaterial-based model objects
 * (walls, etc.) are visible in the 3D view.
 */
export class LightingComponent extends Component {
  private ambient?: THREE.AmbientLight;

  private directional?: THREE.DirectionalLight;

  init(): void {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.directional = new THREE.DirectionalLight(0xffffff, 1.0);
    this.directional.position.set(10, 20, 10);

    this.world.scene.add(this.ambient);
    this.world.scene.add(this.directional);
  }

  dispose(): void {
    if (this.ambient) {
      this.world.scene.remove(this.ambient);
      this.ambient.dispose();
    }
    if (this.directional) {
      this.world.scene.remove(this.directional);
      this.directional.dispose();
    }
    this.ambient = undefined;
    this.directional = undefined;
  }
}
