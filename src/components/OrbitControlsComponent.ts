import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Component } from '../engine/Component';

import type { World } from '../engine/World';

export interface OrbitControlsOptions {
  enableDamping?: boolean;

  dampingFactor?: number;
}

export class OrbitControlsComponent extends Component {
  readonly controls: OrbitControls;

  constructor(world: World, options: OrbitControlsOptions = {}) {
    super(world);

    this.controls = new OrbitControls(world.camera, world.renderer.domElement);

    this.controls.enableDamping = options.enableDamping ?? true;

    this.controls.dampingFactor = options.dampingFactor ?? 0.05;

    this.controls.target.set(0, 0, 0);

    this.controls.update();
  }

  update(): void {
    if (!this.enabled) {
      return;
    }

    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
