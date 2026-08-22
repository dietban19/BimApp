import * as THREE from 'three';

import { BaseTool } from './EditorTool';
import { Wall } from '../../model/Wall';
import type { EditorComponent } from '../EditorComponent';

/**
 * Add-Wall mode.
 *
 * First click sets the wall start (snapped to a grid corner). While
 * choosing the second point a translucent preview follows the pointer,
 * constrained to a single axis. Second click commits the wall.
 */
export class WallTool extends BaseTool {
  readonly id = 'wall';

  private startPoint: THREE.Vector3 | null = null;

  private preview?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor(editor: EditorComponent) {
    super(editor);
  }

  activate(): void {
    this.startPoint = null;
    this.ensurePreview();
  }

  deactivate(): void {
    this.startPoint = null;
    this.hidePreview();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.startPoint) {
      return;
    }
    const end = this.resolveEnd(event);
    if (!end) {
      this.hidePreview();
      return;
    }
    this.updatePreview(this.startPoint, end);
  }

  onPointerDown(event: PointerEvent): void {
    const point = this.editor.getCornerFromPointer(event);
    if (!point) {
      return;
    }

    if (!this.startPoint) {
      this.startPoint = point;
      return;
    }

    const end = this.resolveEnd(event);
    if (!end || end.distanceTo(this.startPoint) < 1e-4) {
      return;
    }

    const wall = new Wall({
      start: this.startPoint,
      end,
      height: this.editor.defaultWallHeight,
      thickness: this.editor.defaultWallThickness,
    });
    this.editor.model.addWall(wall);

    // Chain walls: end becomes the next start.
    this.startPoint = end;
    this.hidePreview();
  }

  /**
   * Constrain the end point to the dominant axis relative to the start,
   * so walls only run along x or z.
   */
  private resolveEnd(event: PointerEvent): THREE.Vector3 | null {
    if (!this.startPoint) {
      return null;
    }
    const raw = this.editor.getCornerFromPointer(event);
    if (!raw) {
      return null;
    }
    const dx = Math.abs(raw.x - this.startPoint.x);
    const dz = Math.abs(raw.z - this.startPoint.z);
    if (dx >= dz) {
      return new THREE.Vector3(raw.x, 0, this.startPoint.z);
    }
    return new THREE.Vector3(this.startPoint.x, 0, raw.z);
  }

  private ensurePreview(): void {
    if (this.preview) {
      return;
    }
    const material = new THREE.MeshBasicMaterial({
      color: 0x4da3ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.preview = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.preview.visible = false;
    this.editor.getScene().add(this.preview);
  }

  private updatePreview(start: THREE.Vector3, end: THREE.Vector3): void {
    this.ensurePreview();
    if (!this.preview) {
      return;
    }
    const length = Math.max(0.001, start.distanceTo(end));
    const height = this.editor.defaultWallHeight;
    const thickness = this.editor.defaultWallThickness;

    const old = this.preview.geometry;
    this.preview.geometry = new THREE.BoxGeometry(length, height, thickness);
    old.dispose();

    const center = start.clone().add(end).multiplyScalar(0.5);
    this.preview.position.set(center.x, height / 2, center.z);
    const dir = end.clone().sub(start).normalize();
    this.preview.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
    this.preview.visible = true;
  }

  private hidePreview(): void {
    if (this.preview) {
      this.preview.visible = false;
    }
  }

  disposePreview(): void {
    if (this.preview) {
      this.editor.getScene().remove(this.preview);
      this.preview.geometry.dispose();
      this.preview.material.dispose();
      this.preview = undefined;
    }
  }
}
