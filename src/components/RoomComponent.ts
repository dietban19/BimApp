import { Component } from '../engine/Component';
import { WallToolComponent } from './WallToolComponent';
import { RoomMesh } from '../objects/RoomMesh';
import { detectRooms } from '../utils/roomDetection';
import type { World } from '../engine/World';
import type { WallMesh } from '../objects/WallMesh';
import type { RoomBounds, RoomPoint } from '../types/Room';

export interface RoomComponentOptions {
  showFloors?: boolean;
  showRoofs?: boolean;
  showLabels?: boolean;
}

/** A room as presented to the rest of the application. */
export interface RoomInfo {
  id: string;
  name: string;
  area: number;
  perimeter: number;
  center: RoomPoint;
  bounds: RoomBounds;
  height: number;
  walls: WallMesh[];
}

/**
 * Keeps the set of rooms in sync with the wall model.
 *
 * The component owns no editing behaviour of its own: it listens to the wall
 * tool, re-runs the detection whenever the wall layout actually changed, and
 * mirrors the result into the scene. Placing a wall that closes a region
 * therefore creates a room, deleting a boundary wall removes it, and adding
 * or removing an interior partition splits or merges the rooms around it.
 */
export class RoomComponent extends Component {
  rooms: RoomInfo[] = [];

  showFloors: boolean;
  showRoofs: boolean;
  showLabels: boolean;

  private wallTool!: WallToolComponent;
  private unsubscribeWallTool?: () => void;

  private readonly meshes = new Map<string, RoomMesh>();
  private readonly listeners = new Set<() => void>();

  /** Fingerprint of the wall layout the current rooms were built from. */
  private layoutSignature = '';

  constructor(world: World, options: RoomComponentOptions = {}) {
    super(world);

    this.showFloors = options.showFloors ?? true;
    this.showRoofs = options.showRoofs ?? true;
    this.showLabels = options.showLabels ?? true;
  }

  init(): void {
    this.wallTool = this.world.get(WallToolComponent);
    this.unsubscribeWallTool = this.wallTool.subscribe(this.handleModelChanged);

    this.refresh(true);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Rooms the given wall bounds. Shared walls belong to several rooms. */
  getRoomsForWall(wall: WallMesh): RoomInfo[] {
    return this.rooms.filter((room) => room.walls.includes(wall));
  }

  setShowFloors(visible: boolean): void {
    if (this.showFloors === visible) return;

    this.showFloors = visible;
    this.applyVisibility();
    this.notify();
  }

  setShowRoofs(visible: boolean): void {
    if (this.showRoofs === visible) return;

    this.showRoofs = visible;
    this.applyVisibility();
    this.notify();
  }

  setShowLabels(visible: boolean): void {
    if (this.showLabels === visible) return;

    this.showLabels = visible;
    this.applyVisibility();
    this.notify();
  }

  toggleFloors(): void {
    this.setShowFloors(!this.showFloors);
  }

  toggleRoofs(): void {
    this.setShowRoofs(!this.showRoofs);
  }

  toggleLabels(): void {
    this.setShowLabels(!this.showLabels);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private handleModelChanged = (): void => {
    this.refresh(false);
  };

  /**
   * Walls that can act as a room boundary.
   *
   * Openings are not consulted on purpose: a door or a window is cut into a
   * wall but never interrupts it, so it cannot break a room.
   */
  private boundaryWalls(): WallMesh[] {
    return [...this.wallTool.walls].filter(
      (wall) => !wall.isPreview && wall.isRoomBoundary,
    );
  }

  private static layoutSignatureOf(walls: readonly WallMesh[]): string {
    const parts = walls.map((wall) => {
      const values = [
        wall.startPoint.x,
        wall.startPoint.z,
        wall.endPoint.x,
        wall.endPoint.z,
        wall.width,
      ];

      return values.map((value) => Math.round(value * 1000)).join(',');
    });

    parts.sort();

    return parts.join(';');
  }

  /**
   * Recomputes the rooms when needed.
   *
   * The wall tool also notifies on hover and selection changes, so the cheap
   * layout fingerprint keeps those from triggering a rebuild.
   */
  refresh(force = false): void {
    const walls = this.boundaryWalls();
    const signature = RoomComponent.layoutSignatureOf(walls);

    if (!force && signature === this.layoutSignature) {
      return;
    }

    this.layoutSignature = signature;

    const detected = detectRooms(walls);

    // Left to right, then front to back, so the numbering is predictable.
    detected.sort(
      (a, b) => a.bounds.minX - b.bounds.minX || a.bounds.minZ - b.bounds.minZ,
    );

    const rooms: RoomInfo[] = [];
    const keep = new Set<string>();

    detected.forEach((room, index) => {
      let id = room.id;
      let suffix = 1;

      // Two faces can only share a fingerprint in degenerate layouts, but the
      // scene objects are keyed by id so it still has to be unique.
      while (keep.has(id)) {
        suffix += 1;
        id = `${room.id}#${suffix}`;
      }

      keep.add(id);

      const name = `Room ${index + 1}`;
      const roomHeight = Math.max(3, ...room.walls.map((wall) => wall.height));
      console.log('room', room.polygon, room.bounds, room.perimeter);
      const options = {
        polygon: room.polygon,
        name,
        area: room.area,
        center: room.center,
        height: roomHeight,
      };

      const existing = this.meshes.get(id);

      if (existing) {
        existing.update(options);
      } else {
        const mesh = new RoomMesh(id, options);
        this.meshes.set(id, mesh);
        this.world.meshes.add(mesh.floorSurface);
        this.world.meshes.add(mesh.roofSurface);
        this.world.scene.add(mesh);
      }

      rooms.push({
        id,
        name,
        area: room.area,
        perimeter: room.perimeter,
        center: room.center,
        bounds: room.bounds,
        height: roomHeight,
        walls: room.walls,
      });
    });

    for (const [id, mesh] of [...this.meshes]) {
      if (keep.has(id)) continue;

      this.meshes.delete(id);
      this.world.removeMesh(mesh.floorSurface);
      this.world.removeMesh(mesh.roofSurface);
      this.world.scene.remove(mesh);
      mesh.dispose();
    }

    this.rooms = rooms;

    this.applyVisibility();
    this.notify();
  }

  private applyVisibility(): void {
    for (const mesh of this.meshes.values()) {
      mesh.setFloorVisible(this.showFloors);
      mesh.setRoofVisible(this.showRoofs);
      mesh.setLabelVisible(this.showLabels);
    }
  }

  dispose(): void {
    this.unsubscribeWallTool?.();
    this.unsubscribeWallTool = undefined;

    for (const mesh of this.meshes.values()) {
      this.world.removeMesh(mesh.floorSurface);
      this.world.removeMesh(mesh.roofSurface);
      this.world.scene.remove(mesh);
      mesh.dispose();
    }

    this.meshes.clear();
    this.rooms = [];
    this.layoutSignature = '';
    this.listeners.clear();
  }
}
