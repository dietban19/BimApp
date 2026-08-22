import * as THREE from 'three';

import { Emitter } from './Emitter';
import { Wall } from './Wall';
import { Room } from './Room';

export interface ModelChange {
  walls: Wall[];
  rooms: Room[];
}

const EPS = 1e-4;

function key(x: number, z: number): string {
  return `${x.toFixed(3)}|${z.toFixed(3)}`;
}

/**
 * Central registry for all model objects (walls, rooms).
 *
 * Responsibilities:
 *  - own the authoritative list of walls / rooms
 *  - keep walls added to / removed from the world scene
 *  - compute clean junction trims between perpendicular walls
 *  - detect closed rectangular rooms and name them
 *  - notify observers (the UI) when the model changes
 *
 * It deliberately knows nothing about tools or React.
 */
export class ModelStore {
  readonly changed = new Emitter<ModelChange>();

  private readonly wallList: Wall[] = [];

  private readonly roomList: Room[] = [];

  private roomCounter = 0;

  private readonly onAddMesh: (wall: Wall) => void;

  private readonly onRemoveMesh: (wall: Wall) => void;

  constructor(
    onAddMesh: (wall: Wall) => void,
    onRemoveMesh: (wall: Wall) => void,
  ) {
    this.onAddMesh = onAddMesh;
    this.onRemoveMesh = onRemoveMesh;
  }

  get walls(): readonly Wall[] {
    return this.wallList;
  }

  get rooms(): readonly Room[] {
    return this.roomList;
  }

  /**
   * Add a wall. If an identical (same centre-line) wall already exists
   * it is returned instead, preventing duplicate overlapping walls.
   */
  addWall(wall: Wall): Wall {
    const existing = this.findSameWall(wall.start, wall.end);
    if (existing) {
      wall.dispose();
      return existing;
    }

    this.wallList.push(wall);
    this.onAddMesh(wall);

    this.recomputeJunctions();
    this.detectRooms();
    this.emit();
    return wall;
  }

  removeWall(wall: Wall): void {
    const index = this.wallList.indexOf(wall);
    if (index === -1) {
      return;
    }
    this.wallList.splice(index, 1);
    this.onRemoveMesh(wall);
    wall.dispose();

    this.recomputeJunctions();
    this.detectRooms();
    this.emit();
  }

  updateWallHeight(wall: Wall, height: number): void {
    wall.setHeight(height);
    this.emit();
  }

  /** Notify the UI without changing anything structurally. */
  touch(): void {
    this.emit();
  }

  private findSameWall(a: THREE.Vector3, b: THREE.Vector3): Wall | undefined {
    return this.wallList.find((w) => {
      const sameForward =
        w.start.distanceTo(a) < EPS && w.end.distanceTo(b) < EPS;
      const sameReverse =
        w.start.distanceTo(b) < EPS && w.end.distanceTo(a) < EPS;
      return sameForward || sameReverse;
    });
  }

  /**
   * For every wall, trim each end back by half the thickness of any
   * perpendicular wall whose centre-line the end touches, producing
   * clean L / T junctions with no overlap or gaps.
   */
  private recomputeJunctions(): void {
    for (const wall of this.wallList) {
      let trimStart = 0;
      let trimEnd = 0;

      for (const other of this.wallList) {
        if (other === wall) {
          continue;
        }
        if (other.axis === wall.axis) {
          continue;
        }

        if (this.endpointOnWall(wall.start, other)) {
          trimStart = Math.max(trimStart, other.thickness / 2);
        }
        if (this.endpointOnWall(wall.end, other)) {
          trimEnd = Math.max(trimEnd, other.thickness / 2);
        }
      }

      wall.setTrims(trimStart, trimEnd);
    }
  }

  /**
   * True if `point` lies on `wall`'s centre-line segment (perpendicular
   * membership, including the wall's endpoints for L junctions).
   */
  private endpointOnWall(point: THREE.Vector3, wall: Wall): boolean {
    if (wall.axis === 'x') {
      if (Math.abs(point.z - wall.start.z) > EPS) {
        return false;
      }
      const minX = Math.min(wall.start.x, wall.end.x) - EPS;
      const maxX = Math.max(wall.start.x, wall.end.x) + EPS;
      return point.x >= minX && point.x <= maxX;
    }
    if (Math.abs(point.x - wall.start.x) > EPS) {
      return false;
    }
    const minZ = Math.min(wall.start.z, wall.end.z) - EPS;
    const maxZ = Math.max(wall.start.z, wall.end.z) + EPS;
    return point.z >= minZ && point.z <= maxZ;
  }

  /**
   * Detect closed axis-aligned rectangles from the wall graph.
   *
   * We build a graph of endpoints connected by walls, then look for
   * rectangles whose four sides are all present as walls (a wall may
   * span multiple rectangle corners). Rooms are keyed by their extents
   * so shared-wall rooms are not duplicated.
   */
  private detectRooms(): void {
    const corners = new Set<string>();
    const cornerPoints = new Map<string, THREE.Vector2>();

    for (const w of this.wallList) {
      for (const p of [w.start, w.end]) {
        const k = key(p.x, p.z);
        corners.add(k);
        cornerPoints.set(k, new THREE.Vector2(p.x, p.z));
      }
    }

    const pts = [...cornerPoints.values()];
    const found = new Map<string, Room>();

    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        if (Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS) {
          continue; // need opposite corners
        }
        const min = new THREE.Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y));
        const max = new THREE.Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y));

        const sides = [
          [new THREE.Vector2(min.x, min.y), new THREE.Vector2(max.x, min.y)],
          [new THREE.Vector2(max.x, min.y), new THREE.Vector2(max.x, max.y)],
          [new THREE.Vector2(max.x, max.y), new THREE.Vector2(min.x, max.y)],
          [new THREE.Vector2(min.x, max.y), new THREE.Vector2(min.x, min.y)],
        ];

        const boundingWalls: Wall[] = [];
        const ok = sides.every((s) => {
          const w = this.wallCovering(s[0], s[1]);
          if (w && !boundingWalls.includes(w)) {
            boundingWalls.push(w);
          }
          return !!w;
        });

        if (ok) {
          const room = new Room('', boundingWalls, min, max);
          if (!found.has(room.key)) {
            found.set(room.key, room);
          }
        }
      }
    }

    // Preserve names of previously detected rooms; assign new names.
    const previousByKey = new Map(this.roomList.map((r) => [r.key, r]));
    const next: Room[] = [];
    for (const [k, room] of found) {
      const prev = previousByKey.get(k);
      if (prev) {
        next.push(prev);
      } else {
        this.roomCounter += 1;
        room.name = `Room ${this.roomCounter}`;
        next.push(room);
      }
    }

    this.roomList.length = 0;
    this.roomList.push(...next);
  }

  /** Find a single wall whose centre-line covers the segment a->b. */
  private wallCovering(a: THREE.Vector2, b: THREE.Vector2): Wall | undefined {
    return this.wallList.find((w) => {
      const s = new THREE.Vector2(w.start.x, w.start.z);
      const e = new THREE.Vector2(w.end.x, w.end.z);
      const covers = (p: THREE.Vector2, q: THREE.Vector2) =>
        this.segmentContains(s, e, p) && this.segmentContains(s, e, q);
      return covers(a, b);
    });
  }

  private segmentContains(
    s: THREE.Vector2,
    e: THREE.Vector2,
    p: THREE.Vector2,
  ): boolean {
    // Collinear axis-aligned check.
    if (Math.abs(s.x - e.x) < EPS) {
      if (Math.abs(p.x - s.x) > EPS) return false;
      const min = Math.min(s.y, e.y) - EPS;
      const max = Math.max(s.y, e.y) + EPS;
      return p.y >= min && p.y <= max;
    }
    if (Math.abs(s.y - e.y) < EPS) {
      if (Math.abs(p.y - s.y) > EPS) return false;
      const min = Math.min(s.x, e.x) - EPS;
      const max = Math.max(s.x, e.x) + EPS;
      return p.x >= min && p.x <= max;
    }
    return false;
  }

  private emit(): void {
    this.changed.emit({ walls: [...this.wallList], rooms: [...this.roomList] });
  }

  dispose(): void {
    for (const wall of this.wallList) {
      this.onRemoveMesh(wall);
      wall.dispose();
    }
    this.wallList.length = 0;
    this.roomList.length = 0;
    this.changed.clear();
  }
}
