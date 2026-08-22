import * as THREE from 'three';

import { Component } from '../engine/Component';
import type { World } from '../engine/World';
import { GridComponent } from './GridComponent';
import { OrbitControlsComponent } from './OrbitControlsComponent';
import type { ModelStore } from '../model/ModelStore';

/**
 * Toggles a 2D, black-and-white floor plan view.
 *
 * When enabled it:
 *  - swaps to an orthographic top-down camera
 *  - draws each wall's footprint as a filled black rectangle on white
 *  - hides the 3D meshes / grid / axes
 *
 * All THREE resources created for the plan are tracked and disposed on
 * toggle-off (or component dispose), and the original 3D scene state is
 * restored exactly.
 */
export class FloorPlanComponent extends Component {
  private active = false;

  private model: ModelStore | null = null;

  private planGroup?: THREE.Group;

  private planCamera?: THREE.OrthographicCamera;

  private disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  private savedBackground: THREE.Color | THREE.Texture | null = null;

  constructor(world: World, model?: ModelStore) {
    super(world);
    this.model = model ?? null;
  }

  setModel(model: ModelStore): void {
    this.model = model;
  }

  isActive(): boolean {
    return this.active;
  }

  toggle(): boolean {
    this.setActive(!this.active);
    return this.active;
  }

  setActive(value: boolean): void {
    if (value === this.active) {
      return;
    }
    this.active = value;
    if (value) {
      this.enter();
    } else {
      this.exit();
    }
  }

  /** Rebuild plan geometry when the model changes while active. */
  refresh(): void {
    if (!this.active) {
      return;
    }
    this.buildPlan();
  }

  private enter(): void {
    // Hide 3D helpers + meshes.
    this.setGridVisible(false);
    for (const mesh of this.world.meshes) {
      mesh.visible = false;
    }

    // Disable orbit controls in 2D.
    if (this.world.has(OrbitControlsComponent)) {
      this.world.get(OrbitControlsComponent).enabled = false;
    }

    // White background for a paper-like plan.
    this.savedBackground = this.world.scene.background;
    this.world.scene.background = new THREE.Color(0xffffff);

    this.setupCamera();
    this.world.overrideCamera = this.planCamera ?? null;
    this.buildPlan();
  }

  private exit(): void {
    this.disposePlan();

    if (this.planCamera) {
      this.planCamera = undefined;
    }

    this.world.overrideCamera = null;

    // Restore background.
    this.world.scene.background = this.savedBackground;
    this.savedBackground = null;

    // Restore helpers + meshes.
    this.setGridVisible(true);
    for (const mesh of this.world.meshes) {
      mesh.visible = true;
    }

    if (this.world.has(OrbitControlsComponent)) {
      this.world.get(OrbitControlsComponent).enabled = true;
    }
  }

  private setupCamera(): void {
    const width = Math.max(this.world.container.clientWidth, 1);
    const height = Math.max(this.world.container.clientHeight, 1);
    const aspect = width / height;
    const extent = 20;
    this.planCamera = new THREE.OrthographicCamera(
      -extent * aspect,
      extent * aspect,
      extent,
      -extent,
      0.1,
      1000,
    );
    this.planCamera.position.set(0, 100, 0);
    this.planCamera.up.set(0, 0, -1);
    this.planCamera.lookAt(0, 0, 0);
  }

  private buildPlan(): void {
    this.disposePlan();
    if (!this.model) {
      return;
    }

    this.planGroup = new THREE.Group();

    const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.disposables.push(wallMaterial);

    for (const wall of this.model.walls) {
      const length = wall.length;
      const geometry = new THREE.PlaneGeometry(length, wall.thickness);
      this.disposables.push(geometry);
      const plane = new THREE.Mesh(geometry, wallMaterial);
      plane.rotation.x = -Math.PI / 2;
      const center = wall.center;
      plane.position.set(center.x, 0.01, center.z);
      const dir = wall.direction;
      plane.rotation.z = -Math.atan2(-dir.z, dir.x);
      this.planGroup.add(plane);
    }

    this.world.scene.add(this.planGroup);
  }

  private disposePlan(): void {
    if (this.planGroup) {
      this.world.scene.remove(this.planGroup);
      this.planGroup.clear();
      this.planGroup = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private setGridVisible(visible: boolean): void {
    if (!this.world.has(GridComponent)) {
      return;
    }
    // The grid component owns its helpers privately; toggle via scene.
    this.world.scene.traverse((obj) => {
      if (obj instanceof THREE.GridHelper || obj instanceof THREE.AxesHelper) {
        obj.visible = visible;
      }
    });
  }

  /** The camera the World should render with, if the plan is active. */
  getActiveCamera(): THREE.Camera | null {
    return this.active ? this.planCamera ?? null : null;
  }

  resize(width: number, height: number): void {
    if (!this.active || !this.planCamera) {
      return;
    }
    const aspect = width / height;
    const extent = 20;
    this.planCamera.left = -extent * aspect;
    this.planCamera.right = extent * aspect;
    this.planCamera.top = extent;
    this.planCamera.bottom = -extent;
    this.planCamera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.active) {
      this.exit();
    }
  }
}
