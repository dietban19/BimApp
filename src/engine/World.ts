import * as THREE from 'three';
import { Component, type ComponentConstructor } from './Component';

export interface WorldOptions {
  background?: THREE.ColorRepresentation;
  fov?: number;
  near?: number;
  far?: number;
}

export class World {
  readonly id = crypto.randomUUID();

  readonly scene: THREE.Scene;

  readonly camera: THREE.PerspectiveCamera;

  readonly renderer: THREE.WebGLRenderer;

  /**
   * Application/model meshes that belong to this world.
   *
   * Later, walls, doors, slabs, etc. can be registered here.
   */
  readonly meshes = new Set<THREE.Mesh>();

  readonly container: HTMLElement;

  enabled = true;

  private readonly components = new Map<Function, Component>();

  private readonly resizeObserver: ResizeObserver;

  private disposed = false;

  constructor(container: HTMLElement, options: WorldOptions = {}) {
    this.container = container;

    // --------------------------------
    // Scene
    // --------------------------------

    this.scene = new THREE.Scene();

    this.scene.background = new THREE.Color(options.background ?? 0x111111);

    // --------------------------------
    // Camera
    // --------------------------------

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.camera = new THREE.PerspectiveCamera(
      options.fov ?? 60,
      width / height,
      options.near ?? 0.1,
      options.far ?? 1000,
    );

    this.camera.position.set(6, 6, 6);
    this.camera.lookAt(0, 0, 0);

    // --------------------------------
    // Renderer
    // --------------------------------

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.setSize(width, height);

    container.appendChild(this.renderer.domElement);

    // --------------------------------
    // Resize handling
    // --------------------------------

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });

    this.resizeObserver.observe(container);

    this.resize();
  }

  /**
   * Adds a component to this world.
   *
   * Each component class can only exist once in a world.
   */
  add<T extends Component, Args extends unknown[]>(
    ComponentType: ComponentConstructor<T, Args>,
    ...args: Args
  ): T {
    if (this.disposed) {
      throw new Error('Cannot add a component to a disposed world.');
    }

    if (this.components.has(ComponentType)) {
      throw new Error(
        `${ComponentType.name} has already been added to this world.`,
      );
    }

    const component = new ComponentType(this, ...args);

    this.components.set(ComponentType, component);

    try {
      component.init();
    } catch (error) {
      this.components.delete(ComponentType);
      component.dispose();
      throw error;
    }

    return component;
  }

  /**
   * Gets an existing component from this world.
   */
  get<T extends Component>(ComponentType: ComponentConstructor<T, any[]>): T {
    const component = this.components.get(ComponentType);

    if (!component) {
      throw new Error(
        `${ComponentType.name} has not been added to this world.`,
      );
    }

    return component as T;
  }

  /**
   * Returns true if the world contains this component.
   */
  has<T extends Component>(
    ComponentType: ComponentConstructor<T, any[]>,
  ): boolean {
    return this.components.has(ComponentType);
  }

  /**
   * Called by Engine every frame.
   */
  update(delta: number): void {
    if (!this.enabled || this.disposed) {
      return;
    }

    for (const component of this.components.values()) {
      if (!component.enabled) {
        continue;
      }

      component.update(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Updates the camera and renderer when the container changes size.
   */
  resize(): void {
    if (this.disposed) {
      return;
    }

    const width = Math.max(this.container.clientWidth, 1);

    const height = Math.max(this.container.clientHeight, 1);

    this.camera.aspect = width / height;

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    for (const component of this.components.values()) {
      component.resize(width, height);
    }
  }

  /**
   * Removes a model mesh from the world and scene.
   *
   * This does not automatically dispose its geometry/material because
   * ownership of those resources may belong to another object.
   */
  removeMesh(mesh: THREE.Mesh): void {
    this.meshes.delete(mesh);
    this.scene.remove(mesh);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.enabled = false;

    this.resizeObserver.disconnect();

    const componentList = [...this.components.values()].reverse();

    for (const component of componentList) {
      component.enabled = false;
      component.dispose();
    }

    this.components.clear();
    this.meshes.clear();

    this.scene.clear();

    this.renderer.dispose();

    const canvas = this.renderer.domElement;

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
