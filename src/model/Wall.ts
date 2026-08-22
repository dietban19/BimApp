import * as THREE from 'three';

import { MeshObject } from './MeshObject';

export type Axis = 'x' | 'z';

export interface WallOptions {
  /** World-space start point on the ground plane (y = 0). */
  start: THREE.Vector3;
  /** World-space end point on the ground plane (y = 0). */
  end: THREE.Vector3;
  height?: number;
  thickness?: number;
  name?: string;
}

/**
 * An axis-aligned wall.
 *
 * The wall's centre-line runs from `start` to `end`. Both points are
 * expected to be grid-snapped and share either their x or z coordinate
 * (enforced at construction) so the wall is always axis-aligned.
 *
 * Junction handling is expressed through `trimStart` / `trimEnd`:
 * the amount (in world units) to pull each end in along the wall's
 * length so it meets a perpendicular wall's face cleanly. The stored
 * centre-line never changes, keeping topology/room detection stable.
 */
export class Wall extends MeshObject {
  readonly type = 'Wall';

  readonly start: THREE.Vector3;

  readonly end: THREE.Vector3;

  height: number;

  thickness: number;

  /** Inset applied at the start / end for clean junctions. */
  trimStart = 0;

  trimEnd = 0;

  constructor(options: WallOptions) {
    super(options.name, 0xcfcfcf);

    this.start = options.start.clone();
    this.end = options.end.clone();

    this.start.y = 0;
    this.end.y = 0;

    if (!Wall.isAxisAligned(this.start, this.end)) {
      throw new Error('Walls must be axis-aligned (share x or z).');
    }

    this.height = options.height ?? 3;
    this.thickness = options.thickness ?? 0.2;

    this.build();
  }

  static isAxisAligned(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = Math.abs(a.x - b.x);
    const dz = Math.abs(a.z - b.z);
    const eps = 1e-6;

    // Exactly one axis differs.
    return (dx < eps) !== (dz < eps);
  }

  /**
   * The axis the wall runs along.
   */
  get axis(): Axis {
    return Math.abs(this.end.x - this.start.x) > Math.abs(this.end.z - this.start.z)
      ? 'x'
      : 'z';
  }

  /** Untrimmed centre-line length. */
  get length(): number {
    return this.start.distanceTo(this.end);
  }

  /** Midpoint of the (untrimmed) centre-line. */
  get center(): THREE.Vector3 {
    return this.start.clone().add(this.end).multiplyScalar(0.5);
  }

  /** Unit direction from start to end. */
  get direction(): THREE.Vector3 {
    return this.end.clone().sub(this.start).normalize();
  }

  setHeight(height: number): void {
    this.height = Math.max(0.01, height);
    this.build();
  }

  setTrims(trimStart: number, trimEnd: number): void {
    this.trimStart = Math.max(0, trimStart);
    this.trimEnd = Math.max(0, trimEnd);
    this.build();
  }

  protected buildGeometry(): THREE.BufferGeometry {
    const fullLength = this.length;

    const trimmedLength = Math.max(
      0.001,
      fullLength - this.trimStart - this.trimEnd,
    );

    const geometry = new THREE.BoxGeometry(
      trimmedLength,
      this.height,
      this.thickness,
    );

    /*
     * Position + orient the mesh so the box centre-line lies on the
     * (trimmed) segment. We update the mesh transform here because the
     * geometry itself is built along local +X.
     */
    const dir = this.direction;

    // Shift the segment centre to account for asymmetric trims.
    const centreOffset = (this.trimStart - this.trimEnd) / 2;

    const center = this.center.clone().add(dir.clone().multiplyScalar(centreOffset));

    this.mesh.position.set(center.x, this.height / 2, center.z);

    // Rotate around Y so local +X aligns with the wall direction.
    const angle = Math.atan2(-dir.z, dir.x);
    this.mesh.rotation.set(0, angle, 0);

    return geometry;
  }
}
