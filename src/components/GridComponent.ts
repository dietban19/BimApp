import * as THREE from 'three';

import { Component } from '../engine/Component';
import { RaycastComponent } from './RaycastComponent';
import type { World } from '../engine/World';
import type { GridCell } from '../types/GridCell';

export interface GridComponentOptions {
  size?: number;
  divisions?: number;
  showAxes?: boolean;
}

export class GridComponent extends Component {
  readonly size: number;

  readonly divisions: number;

  readonly cellSize: number;

  private readonly showAxes: boolean;

  private grid?: THREE.GridHelper;

  private axes?: THREE.AxesHelper;

  private raycastPlane?: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;

  private highlight?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private raycaster?: RaycastComponent;

  constructor(world: World, options: GridComponentOptions = {}) {
    super(world);

    this.size = options.size ?? 100;

    this.divisions = options.divisions ?? 100;

    if (this.size <= 0) {
      throw new Error('Grid size must be greater than zero.');
    }

    if (!Number.isInteger(this.divisions) || this.divisions <= 0) {
      throw new Error('Grid divisions must be a positive integer.');
    }

    this.cellSize = this.size / this.divisions;

    this.showAxes = options.showAxes ?? true;
  }

  init(): void {
    /*
     * GridComponent depends on RaycastComponent.
     *
     * Making that dependency explicit gives future tools a shared
     * raycasting implementation instead of each one creating its own.
     */
    this.raycaster = this.world.get(RaycastComponent);

    this.createGrid();

    this.createRaycastPlane();

    this.createHighlight();

    const canvas = this.world.renderer.domElement;

    canvas.addEventListener('pointermove', this.handlePointerMove);

    canvas.addEventListener('pointerleave', this.handlePointerLeave);
  }

  /**
   * Returns the grid cell under the pointer.
   *
   * This is intentionally public so future tools such as WallToolComponent
   * can reuse the grid's snapping logic.
   */
  getCellFromPointer(event: PointerEvent): GridCell | null {
    if (!this.raycastPlane || !this.raycaster) {
      return null;
    }

    const intersections = this.raycaster.castObject(event, this.raycastPlane);

    if (intersections.length === 0) {
      return null;
    }

    return this.getCellAtPoint(intersections[0].point);
  }

  /**
   * Converts a world-space point into a snapped grid cell.
   */
  getCellAtPoint(point: THREE.Vector3): GridCell | null {
    const halfSize = this.size / 2;

    if (
      point.x < -halfSize ||
      point.x > halfSize ||
      point.z < -halfSize ||
      point.z > halfSize
    ) {
      return null;
    }

    let column = Math.floor((point.x + halfSize) / this.cellSize);

    let row = Math.floor((point.z + halfSize) / this.cellSize);

    /*
     * A point exactly on the positive outer edge can evaluate to
     * divisions instead of divisions - 1.
     */
    column = THREE.MathUtils.clamp(column, 0, this.divisions - 1);

    row = THREE.MathUtils.clamp(row, 0, this.divisions - 1);

    const x = -halfSize + column * this.cellSize + this.cellSize / 2;

    const z = -halfSize + row * this.cellSize + this.cellSize / 2;

    return {
      column,
      row,
      x,
      z,
    };
  }

  /**
   * Snaps a world-space point to the nearest grid corner (intersection
   * of grid lines). Walls attach to corners so junctions align exactly.
   */
  getCornerAtPoint(point: THREE.Vector3): THREE.Vector3 | null {
    const halfSize = this.size / 2;

    if (
      point.x < -halfSize - this.cellSize ||
      point.x > halfSize + this.cellSize ||
      point.z < -halfSize - this.cellSize ||
      point.z > halfSize + this.cellSize
    ) {
      return null;
    }

    const snap = (value: number): number => {
      const index = Math.round((value + halfSize) / this.cellSize);
      const clamped = THREE.MathUtils.clamp(index, 0, this.divisions);
      return -halfSize + clamped * this.cellSize;
    };

    return new THREE.Vector3(snap(point.x), 0, snap(point.z));
  }

  /**
   * Returns the grid corner under the pointer, snapped to the nearest
   * grid-line intersection.
   */
  getCornerFromPointer(event: PointerEvent): THREE.Vector3 | null {
    if (!this.raycastPlane || !this.raycaster) {
      return null;
    }

    const intersections = this.raycaster.castObject(event, this.raycastPlane);

    if (intersections.length === 0) {
      return null;
    }

    return this.getCornerAtPoint(intersections[0].point);
  }

  /**
   * Returns the world-space center of a cell.
   */
  getCellPosition(cell: GridCell): THREE.Vector3 {
    return new THREE.Vector3(cell.x, 0, cell.z);
  }

  dispose(): void {
    const canvas = this.world.renderer.domElement;

    canvas.removeEventListener('pointermove', this.handlePointerMove);

    canvas.removeEventListener('pointerleave', this.handlePointerLeave);

    if (this.grid) {
      this.world.scene.remove(this.grid);

      this.grid.geometry.dispose();

      this.disposeMaterial(this.grid.material);
    }

    if (this.axes) {
      this.world.scene.remove(this.axes);

      this.axes.geometry.dispose();

      this.disposeMaterial(this.axes.material);
    }

    if (this.raycastPlane) {
      this.world.scene.remove(this.raycastPlane);

      this.raycastPlane.geometry.dispose();

      this.raycastPlane.material.dispose();
    }

    if (this.highlight) {
      this.world.scene.remove(this.highlight);

      this.highlight.geometry.dispose();

      this.highlight.material.dispose();
    }

    this.grid = undefined;
    this.axes = undefined;
    this.raycastPlane = undefined;
    this.highlight = undefined;
  }

  private createGrid(): void {
    this.grid = new THREE.GridHelper(this.size, this.divisions);

    this.world.scene.add(this.grid);

    if (this.showAxes) {
      this.axes = new THREE.AxesHelper(15);

      this.world.scene.add(this.axes);
    }
  }

  private createRaycastPlane(): void {
    const geometry = new THREE.PlaneGeometry(this.size, this.size);

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.raycastPlane = new THREE.Mesh(geometry, material);

    /*
     * PlaneGeometry begins on the XY plane.
     * Rotate it onto the XZ ground plane.
     */
    this.raycastPlane.rotation.x = -Math.PI / 2;

    this.world.scene.add(this.raycastPlane);
  }

  private createHighlight(): void {
    const geometry = new THREE.PlaneGeometry(this.cellSize, this.cellSize);

    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.highlight = new THREE.Mesh(geometry, material);

    this.highlight.rotation.x = -Math.PI / 2;

    /*
     * Slight offset avoids z-fighting against the grid.
     */
    this.highlight.position.y = 0.01;

    this.highlight.visible = false;

    this.world.scene.add(this.highlight);
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled || !this.highlight) {
      return;
    }

    const cell = this.getCellFromPointer(event);

    if (!cell) {
      this.highlight.visible = false;

      return;
    }

    this.highlight.position.set(cell.x, 0.01, cell.z);

    this.highlight.visible = true;
  };

  private handlePointerLeave = (): void => {
    if (!this.highlight) {
      return;
    }

    this.highlight.visible = false;
  };

  private disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      for (const item of material) {
        item.dispose();
      }

      return;
    }

    material.dispose();
  }
}
