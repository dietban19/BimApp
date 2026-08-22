import * as THREE from 'three';

import { BaseTool } from './EditorTool';
import { Wall } from '../../model/Wall';
import type { EditorComponent } from '../EditorComponent';

/**
 * Add-Room mode.
 *
 * Click two opposite grid corners; the four bounding walls are created
 * (reusing existing walls via ModelStore dedup), which in turn triggers
 * automatic Room detection in the store.
 */
export class RoomTool extends BaseTool {
  readonly id = 'room';

  private firstCorner: THREE.Vector3 | null = null;

  private preview?: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;

  constructor(editor: EditorComponent) {
    super(editor);
  }

  activate(): void {
    this.firstCorner = null;
    this.ensurePreview();
  }

  deactivate(): void {
    this.firstCorner = null;
    this.hidePreview();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.firstCorner) {
      return;
    }
    const corner = this.editor.getCornerFromPointer(event);
    if (!corner) {
      this.hidePreview();
      return;
    }
    this.updatePreview(this.firstCorner, corner);
  }

  onPointerDown(event: PointerEvent): void {
    const corner = this.editor.getCornerFromPointer(event);
    if (!corner) {
      return;
    }

    if (!this.firstCorner) {
      this.firstCorner = corner;
      return;
    }

    const a = this.firstCorner;
    const b = corner;
    if (Math.abs(a.x - b.x) < 1e-4 || Math.abs(a.z - b.z) < 1e-4) {
      return; // degenerate rectangle
    }

    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z);
    const maxZ = Math.max(a.z, b.z);

    const corners = {
      nw: new THREE.Vector3(minX, 0, minZ),
      ne: new THREE.Vector3(maxX, 0, minZ),
      se: new THREE.Vector3(maxX, 0, maxZ),
      sw: new THREE.Vector3(minX, 0, maxZ),
    };

    const segments: [THREE.Vector3, THREE.Vector3][] = [
      [corners.nw, corners.ne],
      [corners.ne, corners.se],
      [corners.se, corners.sw],
      [corners.sw, corners.nw],
    ];

    for (const [start, end] of segments) {
      this.editor.model.addWall(
        new Wall({
          start,
          end,
          height: this.editor.defaultWallHeight,
          thickness: this.editor.defaultWallThickness,
        }),
      );
    }

    this.firstCorner = null;
    this.hidePreview();
  }

  private ensurePreview(): void {
    if (this.preview) {
      return;
    }
    const material = new THREE.LineBasicMaterial({ color: 0x4da3ff });
    this.preview = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    this.preview.visible = false;
    this.editor.getScene().add(this.preview);
  }

  private updatePreview(a: THREE.Vector3, b: THREE.Vector3): void {
    this.ensurePreview();
    if (!this.preview) {
      return;
    }
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z);
    const maxZ = Math.max(a.z, b.z);
    const y = 0.02;
    const p = [
      new THREE.Vector3(minX, y, minZ),
      new THREE.Vector3(maxX, y, minZ),
      new THREE.Vector3(maxX, y, minZ),
      new THREE.Vector3(maxX, y, maxZ),
      new THREE.Vector3(maxX, y, maxZ),
      new THREE.Vector3(minX, y, maxZ),
      new THREE.Vector3(minX, y, maxZ),
      new THREE.Vector3(minX, y, minZ),
    ];
    const old = this.preview.geometry;
    this.preview.geometry = new THREE.BufferGeometry().setFromPoints(p);
    old.dispose();
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
