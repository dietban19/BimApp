import * as THREE from 'three';

import { SceneObject } from './SceneObject';
import type { Wall } from './Wall';

/**
 * A closed rectangular area bounded by four axis-aligned walls.
 *
 * A Room is a pure data object: it references the walls that bound it
 * and knows its rectangular extents. It owns no GPU resources by
 * default (floor visualisation, if any, is handled elsewhere), which
 * keeps room detection cheap and side-effect free.
 */
export class Room extends SceneObject {
  readonly type = 'Room';

  readonly walls: Wall[];

  readonly min: THREE.Vector2;

  readonly max: THREE.Vector2;

  constructor(name: string, walls: Wall[], min: THREE.Vector2, max: THREE.Vector2) {
    super(name);
    this.walls = walls;
    this.min = min.clone();
    this.max = max.clone();
  }

  get width(): number {
    return this.max.x - this.min.x;
  }

  get depth(): number {
    return this.max.y - this.min.y;
  }

  /** Stable key describing the rectangle, used to detect duplicates. */
  get key(): string {
    const r = (n: number) => n.toFixed(3);
    return `${r(this.min.x)},${r(this.min.y)}:${r(this.max.x)},${r(this.max.y)}`;
  }
}
