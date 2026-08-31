/**
 * Shared, renderer agnostic description of a detected room.
 *
 * A room is never authored by the user: it is derived from the wall layout.
 * Whenever the walls form a closed region on the ground plane, that region
 * becomes a room. Because the detection works on the wall graph, walls are
 * free to be shared by several rooms and interior partitions simply split the
 * space they divide.
 */

/** A point on the ground (XZ) plane. */
export interface RoomPoint {
  x: number;
  z: number;
}

/** Axis aligned bounding box of a room on the ground plane. */
export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * The minimum a wall has to expose to take part in room detection.
 *
 * `WallMesh` satisfies this structurally, which keeps the detection itself
 * free of any Three.js / scene graph knowledge.
 */
export interface RoomWallLike {
  readonly startPoint: { x: number; z: number };
  readonly endPoint: { x: number; z: number };
  readonly width: number;
}

/**
 * One closed region found in the wall layout.
 */
export interface DetectedRoom<TWall extends RoomWallLike> {
  /**
   * Stable identity derived from the room's geometry.
   *
   * Rebuilding the model re-uses the same id for an unchanged room, so the
   * scene objects representing it can be kept alive.
   */
  id: string;

  /** Floor outline, inset to the inner faces of the bounding walls. */
  polygon: RoomPoint[];

  /** Raw loop through the wall centre lines. */
  centerline: RoomPoint[];

  /** Floor area in m², measured on the inset polygon. */
  area: number;

  /** Length of the inset outline in m. */
  perimeter: number;

  /** A point inside (or at least near the middle of) the room. */
  center: RoomPoint;

  bounds: RoomBounds;

  /** Walls that bound this room. A shared wall appears in both rooms. */
  walls: TWall[];
}
