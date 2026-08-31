import * as THREE from 'three';

import { BaseMesh } from './BaseMesh';
import type { RoomPoint } from '../types/Room';

export interface RoomMeshOptions {
  polygon: readonly RoomPoint[];
  name: string;
  area: number;
  center: RoomPoint;
}

/** Floor slab of a detected room, drawn just above the grid. */
const FLOOR_HEIGHT = 0.004;

/** Outline offset above the slab, in the mesh's local frame. */
const OUTLINE_OFFSET = 0.004;

/** How high the label floats above the floor. */
const LABEL_HEIGHT = 0.35;

const LABEL_CANVAS_WIDTH = 512;
const LABEL_CANVAS_HEIGHT = 192;
const LABEL_MAX_WIDTH = 2.6;
const LABEL_MIN_WIDTH = 0.9;

const FLOOR_COLOR = 0x38bdf8;
const OUTLINE_COLOR = 0x7dd3fc;

/**
 * A room is derived data: it is created, updated and removed by
 * `RoomComponent` whenever the wall layout changes, and it is intentionally
 * not registered with `World.meshes` so it never interferes with picking
 * walls, doors or windows.
 *
 * The mesh is built in the XY plane and rotated onto the ground, so a room
 * point (x, z) becomes the local point (x, -z).
 */
export class RoomMesh extends BaseMesh {
  readonly roomId: string;

  private outline: THREE.LineLoop<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;

  private label: THREE.Sprite;
  private labelTexture: THREE.CanvasTexture;
  private labelCanvas: HTMLCanvasElement;
  private labelText = '';
  private readonly floorMaterial: THREE.MeshStandardMaterial;

  constructor(roomId: string, options: RoomMeshOptions) {
    const material = new THREE.MeshStandardMaterial({
      color: FLOOR_COLOR,
      transparent: true,
      opacity: 0.18,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    super(RoomMesh.createGeometry(options.polygon), material);

    this.roomId = roomId;
    this.floorMaterial = material;

    this.rotation.x = -Math.PI / 2;
    this.position.y = FLOOR_HEIGHT;
    this.renderOrder = 1;

    this.outline = new THREE.LineLoop(
      RoomMesh.createOutlineGeometry(options.polygon),
      new THREE.LineBasicMaterial({
        color: OUTLINE_COLOR,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.outline.renderOrder = 2;
    this.add(this.outline);

    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = LABEL_CANVAS_WIDTH;
    this.labelCanvas.height = LABEL_CANVAS_HEIGHT;

    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;

    this.label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.labelTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.label.renderOrder = 1000;
    this.add(this.label);

    this.applyLabel(options);
  }

  /**
   * Re-uses the same scene object when a room only changed shape or size.
   */
  update(options: RoomMeshOptions): void {
    this.geometry.dispose();
    this.geometry = RoomMesh.createGeometry(options.polygon);

    this.outline.geometry.dispose();
    this.outline.geometry = RoomMesh.createOutlineGeometry(options.polygon);

    this.applyLabel(options);
  }

  /**
   * Hides the slab and its outline while keeping the object itself in the
   * scene graph, so the label can still be shown on its own.
   */
  setFloorVisible(visible: boolean): void {
    this.floorMaterial.visible = visible;
    this.outline.visible = visible;
  }

  setLabelVisible(visible: boolean): void {
    this.label.visible = visible;
  }

  // --------------------------------
  // Geometry
  // --------------------------------

  private static createGeometry(
    polygon: readonly RoomPoint[],
  ): THREE.BufferGeometry {
    if (polygon.length < 3) {
      return new THREE.BufferGeometry();
    }

    const shape = new THREE.Shape();

    shape.moveTo(polygon[0].x, -polygon[0].z);

    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i].x, -polygon[i].z);
    }

    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }

  private static createOutlineGeometry(
    polygon: readonly RoomPoint[],
  ): THREE.BufferGeometry {
    const points = polygon.map(
      (point) => new THREE.Vector3(point.x, -point.z, OUTLINE_OFFSET),
    );

    return new THREE.BufferGeometry().setFromPoints(points);
  }

  // --------------------------------
  // Label
  // --------------------------------

  private applyLabel(options: RoomMeshOptions): void {
    const text = `${options.name}\n${options.area.toFixed(2)} m²`;

    if (text !== this.labelText) {
      this.labelText = text;
      this.drawLabel(options.name, `${options.area.toFixed(2)} m²`);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const point of options.polygon) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }

    const fitted = Math.min(maxX - minX, maxZ - minZ) * 0.9;
    const width = THREE.MathUtils.clamp(
      Number.isFinite(fitted) ? fitted : LABEL_MAX_WIDTH,
      LABEL_MIN_WIDTH,
      LABEL_MAX_WIDTH,
    );
    const height = (width * LABEL_CANVAS_HEIGHT) / LABEL_CANVAS_WIDTH;

    this.label.scale.set(width, height, 1);
    this.label.position.set(options.center.x, -options.center.z, LABEL_HEIGHT);
  }

  private drawLabel(title: string, subtitle: string): void {
    const context = this.labelCanvas.getContext('2d');

    if (!context) {
      return;
    }

    const width = this.labelCanvas.width;
    const height = this.labelCanvas.height;

    context.clearRect(0, 0, width, height);

    context.fillStyle = 'rgba(15, 23, 42, 0.78)';
    context.beginPath();
    context.roundRect(8, 8, width - 16, height - 16, 26);
    context.fill();

    context.strokeStyle = 'rgba(125, 211, 252, 0.7)';
    context.lineWidth = 4;
    context.stroke();

    context.textAlign = 'center';
    context.textBaseline = 'middle';

    context.fillStyle = '#f8fafc';
    context.font = 'bold 62px sans-serif';
    context.fillText(title, width / 2, height / 2 - 26, width - 48);

    context.fillStyle = '#7dd3fc';
    context.font = '46px sans-serif';
    context.fillText(subtitle, width / 2, height / 2 + 38, width - 48);

    this.labelTexture.needsUpdate = true;
  }

  override dispose(): void {
    this.remove(this.outline);
    this.outline.geometry.dispose();
    this.outline.material.dispose();

    this.remove(this.label);
    this.label.material.map = null;
    this.label.material.dispose();
    this.labelTexture.dispose();

    super.dispose();
  }
}
