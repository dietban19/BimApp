import * as THREE from 'three';
import { Component } from '../engine/Component';
import { GridComponent } from './GridComponent';
import { RaycastComponent } from './RaycastComponent';
import { WallMesh } from '../objects/WallMesh';
import { Opening } from '../objects/openings/Opening';
import {
  createDefaultOpeningParams,
  createOpening,
} from '../objects/openings/OpeningFactory';
import {
  calculateWallJunctions,
  wouldWallOverlapExisting,
} from '../utils/junctions';
import { detectRectRooms } from '../utils/rooms';
import type { OpeningParams, OpeningType } from '../types/Opening';

export type ToolMode = 'select' | 'add-wall' | 'add-door' | 'add-window';
export type PlacementState = 'idle' | 'picking-end';

/** Anything the user can select in the scene. */
export type Selectable = WallMesh | Opening;

/**
 * Placement modes that cut an opening into an existing wall, mapped to the
 * kind of opening they create.
 */
const OPENING_MODES: Readonly<Partial<Record<ToolMode, OpeningType>>> = {
  'add-door': 'door',
  'add-window': 'window',
};

/** Openings snap to this increment along the wall. */
const OPENING_SNAP = 0.05;

function getOpeningTypeForMode(mode: ToolMode): OpeningType | null {
  return OPENING_MODES[mode] ?? null;
}

interface WallSurfaceHit {
  wall: WallMesh;
  distanceAlongWall: number;
}

type ResizeHandleKind = 'start' | 'end' | 'left' | 'right';

interface ResizeHandle {
  kind: ResizeHandleKind;
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
}

interface ResizeDragState {
  wall: WallMesh;
  kind: ResizeHandleKind;
}

const MIN_WALL_LENGTH = 0.05;
const MIN_WALL_WIDTH = 0.05;
const RESIZE_HANDLE_RADIUS = 0.11;
const RESIZE_HANDLE_THICKNESS = 0.04;
const RESIZE_HANDLE_HEIGHT = 0.05;
const RESIZE_HANDLE_COLOR = 0xe2e8f0;
const RESIZE_HANDLE_HOVER_COLOR = 0x60a5fa;
const RESIZE_HANDLE_ACTIVE_COLOR = 0x2563eb;
const ROOM_OVERLAY_Y = 0.008;
const ROOM_LABEL_Y = 0.02;
const ROOM_LABEL_MAX_WIDTH = 2.8;
const ROOM_LABEL_HEIGHT = 0.5;
const ROOM_OVERLAY_COLOR = 0x38bdf8;
const ROOM_OVERLAY_OPACITY = 0.22;

interface RoomLabelVisual {
  floorMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  labelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
}

export class WallToolComponent extends Component {
  mode: ToolMode = 'select';
  placementState: PlacementState = 'idle';

  readonly walls = new Set<WallMesh>();

  selectedWall: WallMesh | null = null;
  selectedOpening: Opening | null = null;

  hoveredWall: WallMesh | null = null;
  hoveredOpening: Opening | null = null;

  /** True while the opening ghost under the cursor could actually be placed. */
  openingPreviewValid = false;

  /** Why the opening ghost cannot be placed, if it cannot. */
  openingPreviewMessage: string | null = null;

  /** Why the last opening property edit was rejected, if it was. */
  openingEditError: string | null = null;

  /** Why the last wall placement attempt was rejected, if it was. */
  wallPlacementError: string | null = null;

  resizeMode = false;

  resizeError: string | null = null;

  roomLabelsEnabled = false;

  defaultHeight = 3.0;
  defaultWidth = 0.3;

  private gridComponent!: GridComponent;
  private raycastComponent!: RaycastComponent;

  private startPoint: THREE.Vector3 | null = null;
  private previewWall: WallMesh | null = null;

  private previewOpening: Opening | null = null;
  private previewOpeningWall: WallMesh | null = null;

  private pointerDownPos: { x: number; y: number } | null = null;

  private hoveredResizeHandle: ResizeHandle | null = null;
  private activeResizeHandle: ResizeHandle | null = null;
  private activeResizeDrag: ResizeDragState | null = null;
  private resizeHandles: ResizeHandle[] = [];
  private roomLabelVisuals: RoomLabelVisual[] = [];

  private ambientLight?: THREE.AmbientLight;
  private directionalLight?: THREE.DirectionalLight;

  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  init(): void {
    this.gridComponent = this.world.get(GridComponent);
    this.raycastComponent = this.world.get(RaycastComponent);

    this.setupLighting();
    this.createResizeHandles();

    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  setMode(mode: ToolMode): void {
    if (this.mode === mode) return;

    // Never leave half finished placement state behind when switching tools.
    this.cancelPlacement();
    this.clearOpeningPreview();

    // Only the select tool works with hover / selection highlighting.
    if (mode !== 'select') {
      this.setHover(null);
      this.setSelection(null);
      this.setResizeMode(false);
    }

    this.mode = mode;
    this.wallPlacementError = null;
    this.updateResizeHandlesVisibility();
    this.updateResizeHandlesForSelection();
    this.notify();
  }

  setResizeMode(enabled: boolean): void {
    if (this.resizeMode === enabled) return;

    this.resizeMode = enabled;
    this.resizeError = null;

    if (!enabled) {
      this.endResizeDrag();
      this.setHoveredResizeHandle(null);
    }

    this.updateResizeHandlesVisibility();
    this.updateResizeHandlesForSelection();
    this.notify();
  }

  toggleResizeMode(): void {
    this.setResizeMode(!this.resizeMode);
  }

  setRoomLabelsEnabled(enabled: boolean): void {
    if (this.roomLabelsEnabled === enabled) return;

    this.roomLabelsEnabled = enabled;
    this.rebuildRoomLabels();
    this.notify();
  }

  toggleRoomLabels(): void {
    this.setRoomLabelsEnabled(!this.roomLabelsEnabled);
  }

  // --------------------------------
  // Wall properties
  // --------------------------------

  setSelectedWallHeight(height: number): void {
    if (this.selectedWall && height > 0) {
      this.selectedWall.setHeight(height);
      this.updateResizeHandlesForSelection();
      this.notify();
    }
  }

  setSelectedWallWidth(width: number): void {
    if (this.selectedWall && width > 0) {
      this.selectedWall.setWidth(width);
      this.updateResizeHandlesForSelection();
      // Recalculate preview / junctions if needed, but for existing wall update geometry
      this.notify();
    }
  }

  setSelectedWallRoomBoundary(enabled: boolean): void {
    if (!this.selectedWall) return;

    this.selectedWall.setRoomBoundary(enabled);
    this.rebuildRoomLabels();
    this.notify();
  }

  deleteSelectedWall(): void {
    if (!this.selectedWall) return;

    this.deleteWall(this.selectedWall);
  }

  deleteWall(wall: WallMesh): void {
    if (!this.walls.has(wall)) return;

    if (this.previewOpeningWall === wall) {
      this.clearOpeningPreview();
    }

    if (this.selectedWall === wall || this.selectedOpening?.wall === wall) {
      this.setSelection(null);
    }

    if (this.hoveredWall === wall || this.hoveredOpening?.wall === wall) {
      this.setHover(null);
    }

    // The openings live inside the wall, so unregister them before disposal.
    for (const opening of wall.openings) {
      this.world.meshes.delete(opening);
    }

    this.walls.delete(wall);
    this.world.removeMesh(wall);
    wall.dispose();
    this.rebuildRoomLabels();

    this.notify();
  }

  // --------------------------------
  // Opening properties
  // --------------------------------

  setSelectedOpeningWidth(width: number): void {
    this.updateSelectedOpening({ width });
  }

  setSelectedOpeningHeight(height: number): void {
    this.updateSelectedOpening({ height });
  }

  setSelectedOpeningSillHeight(sillHeight: number): void {
    this.updateSelectedOpening({ sillHeight });
  }

  setSelectedOpeningDistance(distanceAlongWall: number): void {
    this.updateSelectedOpening({ distanceAlongWall });
  }

  private updateSelectedOpening(patch: Partial<OpeningParams>): void {
    const opening = this.selectedOpening;
    const wall = opening?.wall;

    if (!opening || !wall) return;

    const params: OpeningParams = { ...opening.getParams(), ...patch };
    const validation = wall.canPlaceOpening(params, opening);

    if (!validation.valid) {
      this.openingEditError = validation.reason;
      this.notify();
      return;
    }

    wall.updateOpening(opening, params);
    this.openingEditError = null;
    this.notify();
  }

  deleteSelectedOpening(): void {
    if (this.selectedOpening) {
      this.deleteOpening(this.selectedOpening);
    }
  }

  /**
   * Removes an opening and makes that section of the wall solid again.
   */
  deleteOpening(opening: Opening): void {
    const wall = opening.wall;

    if (!wall) return;

    if (this.selectedOpening === opening) {
      this.setSelection(null);
    }

    if (this.hoveredOpening === opening) {
      this.setHover(null);
    }

    wall.removeOpening(opening);
    this.releaseOpening(opening);

    this.notify();
  }

  /**
   * Unregisters a detached opening from the world and frees its resources.
   */
  private releaseOpening(opening: Opening): void {
    this.world.removeMesh(opening);
    opening.dispose();
  }

  /**
   * Called by a wall when a change (height, thickness, ...) invalidated some
   * of its openings.
   */
  private handleOpeningsRemoved = (openings: Opening[]): void => {
    for (const opening of openings) {
      if (this.selectedOpening === opening) {
        this.setSelection(null);
      }

      if (this.hoveredOpening === opening) {
        this.setHover(null);
      }

      this.releaseOpening(opening);
    }

    this.notify();
  };

  private setupLighting(): void {
    // Add lighting if not already present
    let hasLight = false;
    this.world.scene.traverse((obj) => {
      if ((obj as THREE.Light).isLight) {
        hasLight = true;
      }
    });

    if (!hasLight) {
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      this.directionalLight.position.set(10, 20, 15);

      this.world.scene.add(this.ambientLight);
      this.world.scene.add(this.directionalLight);
    }
  }

  private createResizeHandles(): void {
    const makeHandle = (kind: ResizeHandleKind): ResizeHandle => {
      const geometry = new THREE.CylinderGeometry(
        RESIZE_HANDLE_RADIUS,
        RESIZE_HANDLE_RADIUS,
        RESIZE_HANDLE_THICKNESS,
        24,
      );
      const material = new THREE.MeshStandardMaterial({
        color: RESIZE_HANDLE_COLOR,
        roughness: 0.85,
        metalness: 0.0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 500;
      this.world.scene.add(mesh);
      return { kind, mesh };
    };

    this.resizeHandles = [
      makeHandle('start'),
      makeHandle('end'),
      makeHandle('left'),
      makeHandle('right'),
    ];
  }

  private updateResizeHandlesVisibility(): void {
    const visible =
      this.mode === 'select' && this.resizeMode && this.selectedWall !== null;

    for (const handle of this.resizeHandles) {
      handle.mesh.visible = visible;
    }

    if (!visible) {
      this.hoveredResizeHandle = null;
      this.activeResizeHandle = null;
      this.activeResizeDrag = null;
      this.updateResizeHandleStyles();
    }
  }

  private updateResizeHandlesForSelection(): void {
    const wall = this.selectedWall;

    if (!wall || !this.resizeMode || this.mode !== 'select') {
      return;
    }

    const orientation = wall.getOrientation();
    const midX = (wall.startPoint.x + wall.endPoint.x) / 2;
    const midZ = (wall.startPoint.z + wall.endPoint.z) / 2;
    const halfWidth = wall.width / 2;

    for (const handle of this.resizeHandles) {
      if (handle.kind === 'start') {
        handle.mesh.position.set(
          wall.startPoint.x,
          RESIZE_HANDLE_HEIGHT,
          wall.startPoint.z,
        );
        continue;
      }

      if (handle.kind === 'end') {
        handle.mesh.position.set(
          wall.endPoint.x,
          RESIZE_HANDLE_HEIGHT,
          wall.endPoint.z,
        );
        continue;
      }

      if (orientation === 'x') {
        if (handle.kind === 'left') {
          handle.mesh.position.set(
            midX,
            RESIZE_HANDLE_HEIGHT,
            midZ - halfWidth,
          );
        } else {
          handle.mesh.position.set(
            midX,
            RESIZE_HANDLE_HEIGHT,
            midZ + halfWidth,
          );
        }
      } else {
        if (handle.kind === 'left') {
          handle.mesh.position.set(
            midX - halfWidth,
            RESIZE_HANDLE_HEIGHT,
            midZ,
          );
        } else {
          handle.mesh.position.set(
            midX + halfWidth,
            RESIZE_HANDLE_HEIGHT,
            midZ,
          );
        }
      }
    }
  }

  private pickResizeHandle(event: PointerEvent): ResizeHandle | null {
    if (!this.resizeMode || this.selectedWall === null) {
      return null;
    }

    const visible = this.resizeHandles.filter((h) => h.mesh.visible);
    const intersections = this.raycastComponent.castObjects(
      event,
      visible.map((h) => h.mesh),
      false,
    );

    for (const hit of intersections) {
      const handle = visible.find((item) => item.mesh === hit.object);
      if (handle) return handle;
    }

    return null;
  }

  private setHoveredResizeHandle(handle: ResizeHandle | null): void {
    if (this.hoveredResizeHandle === handle) return;

    this.hoveredResizeHandle = handle;
    this.updateResizeHandleStyles();
  }

  private startResizeDrag(handle: ResizeHandle): void {
    if (!this.selectedWall) return;

    this.activeResizeHandle = handle;
    this.activeResizeDrag = {
      wall: this.selectedWall,
      kind: handle.kind,
    };
    this.resizeError = null;
    this.updateResizeHandleStyles();
  }

  private endResizeDrag(): void {
    this.activeResizeHandle = null;
    this.activeResizeDrag = null;
    this.updateResizeHandleStyles();
  }

  private updateResizeHandleStyles(): void {
    for (const handle of this.resizeHandles) {
      let color = RESIZE_HANDLE_COLOR;
      let scale = 1;

      if (handle === this.activeResizeHandle) {
        color = RESIZE_HANDLE_ACTIVE_COLOR;
        scale = 1.2;
      } else if (handle === this.hoveredResizeHandle) {
        color = RESIZE_HANDLE_HOVER_COLOR;
        scale = 1.1;
      }

      handle.mesh.material.color.setHex(color);
      handle.mesh.scale.setScalar(scale);
    }
  }

  private applyResizeDrag(event: PointerEvent): boolean {
    const drag = this.activeResizeDrag;

    if (!drag) {
      return false;
    }

    const cell = this.gridComponent.getCellFromPointer(event);
    if (!cell) {
      return false;
    }

    const wall = drag.wall;
    const pointer = this.gridComponent.getCellPosition(cell);

    if (drag.kind === 'start' || drag.kind === 'end') {
      const movingStart = drag.kind === 'start';
      const fixed = movingStart
        ? wall.endPoint.clone()
        : wall.startPoint.clone();
      const otherWalls = [...this.walls].filter((item) => item !== wall);

      const junction = calculateWallJunctions(
        fixed,
        pointer,
        wall.width,
        otherWalls,
      );
      const resizedStart = movingStart ? junction.end : junction.start;
      const resizedEnd = movingStart ? junction.start : junction.end;

      if (resizedStart.distanceTo(resizedEnd) <= MIN_WALL_LENGTH) {
        this.resizeError = 'Wall is too short.';
        return false;
      }

      if (
        wouldWallOverlapExisting(
          resizedStart,
          resizedEnd,
          wall.width,
          otherWalls,
        )
      ) {
        this.resizeError =
          'Resized wall overlaps another wall. Move the handle elsewhere.';
        return false;
      }

      wall.setEndpoints(resizedStart, resizedEnd);
      this.rebuildRoomLabels();
      this.resizeError = null;
      return true;
    }

    const orientation = wall.getOrientation();
    const midX = (wall.startPoint.x + wall.endPoint.x) / 2;
    const midZ = (wall.startPoint.z + wall.endPoint.z) / 2;
    const axis =
      orientation === 'x'
        ? Math.abs(pointer.z - midZ)
        : Math.abs(pointer.x - midX);
    const nextWidth = Math.max(axis * 2, MIN_WALL_WIDTH);

    const otherWalls = [...this.walls].filter((item) => item !== wall);
    if (
      wouldWallOverlapExisting(
        wall.startPoint,
        wall.endPoint,
        nextWidth,
        otherWalls,
      )
    ) {
      this.resizeError =
        'Resized wall overlaps another wall. Move the handle elsewhere.';
      return false;
    }

    wall.setWidth(nextWidth);
    this.rebuildRoomLabels();
    this.resizeError = null;
    return true;
  }

  private clearRoomLabels(): void {
    for (const label of this.roomLabelVisuals) {
      this.world.scene.remove(label.floorMesh);
      this.world.scene.remove(label.labelMesh);
      label.floorMesh.geometry.dispose();
      label.labelMesh.geometry.dispose();
      label.floorMesh.material.dispose();
      label.labelMesh.material.dispose();
      label.texture.dispose();
    }

    this.roomLabelVisuals = [];
  }

  private createRoomLabelVisual(
    text: string,
    x: number,
    z: number,
    widthHint: number,
    roomWidth: number,
    roomDepth: number,
  ): RoomLabelVisual {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Unable to create 2D context for room label.');
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a';
    ctx.globalAlpha = 0.78;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#f8fafc';
    ctx.font =
      '600 40px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const worldWidth = Math.min(
      Math.max(widthHint * 0.45, 1.2),
      ROOM_LABEL_MAX_WIDTH,
    );
    const labelGeometry = new THREE.PlaneGeometry(
      worldWidth,
      ROOM_LABEL_HEIGHT,
    );
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const floorGeometry = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: ROOM_OVERLAY_COLOR,
      transparent: true,
      opacity: ROOM_OVERLAY_OPACITY,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(x, ROOM_OVERLAY_Y, z);
    floorMesh.renderOrder = 260;

    const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
    labelMesh.rotation.x = -Math.PI / 2;
    labelMesh.position.set(x, ROOM_LABEL_Y, z);
    labelMesh.renderOrder = 320;

    this.world.scene.add(floorMesh);
    this.world.scene.add(labelMesh);

    return { floorMesh, labelMesh, texture };
  }

  private rebuildRoomLabels(): void {
    this.clearRoomLabels();

    if (!this.roomLabelsEnabled) {
      return;
    }

    const rooms = detectRectRooms(this.walls);

    for (let i = 0; i < rooms.length; i += 1) {
      const room = rooms[i];
      const roomName = `Room ${i + 1}`;
      const visual = this.createRoomLabelVisual(
        roomName,
        room.centerX,
        room.centerZ,
        Math.min(room.maxX - room.minX, room.maxZ - room.minZ),
        room.maxX - room.minX,
        room.maxZ - room.minZ,
      );
      this.roomLabelVisuals.push(visual);
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;

    if (this.mode === 'select' && this.resizeMode) {
      if (this.activeResizeDrag) {
        const nextHandle = this.pickResizeHandle(event);

        if (nextHandle) {
          this.startResizeDrag(nextHandle);
        } else {
          this.endResizeDrag();
        }

        this.notify();
        return;
      }

      const handle = this.pickResizeHandle(event);
      if (handle) {
        this.startResizeDrag(handle);
        this.notify();
        return;
      }
    }

    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;

    if (this.activeResizeDrag) {
      const previousError = this.resizeError;
      const changed = this.applyResizeDrag(event);
      this.updateResizeHandlesForSelection();

      if (changed || previousError !== this.resizeError) {
        this.notify();
      }

      return;
    }

    const openingType = getOpeningTypeForMode(this.mode);

    if (this.mode === 'add-wall') {
      this.handleWallPlacementMove(event);
    } else if (openingType) {
      this.handleOpeningPlacementMove(event, openingType);
    } else if (this.mode === 'select') {
      if (this.resizeMode) {
        this.setHoveredResizeHandle(this.pickResizeHandle(event));
      } else {
        this.setHoveredResizeHandle(null);
      }

      this.handleSelectionMove(event);
    }
  };

  private handleWallPlacementMove(event: PointerEvent): void {
    if (this.placementState !== 'picking-end' || !this.startPoint) return;

    const cell = this.gridComponent.getCellFromPointer(event);
    if (!cell) return;

    const currentPos = this.gridComponent.getCellPosition(cell);

    // Calculate junction-trimmed wall segment
    const junction = calculateWallJunctions(
      this.startPoint,
      currentPos,
      this.defaultWidth,
      this.walls,
    );

    if (!this.previewWall) {
      this.previewWall = new WallMesh({
        startPoint: junction.start,
        endPoint: junction.end,
        height: this.defaultHeight,
        width: this.defaultWidth,
        isPreview: true,
      });
      this.world.scene.add(this.previewWall);
    } else {
      this.previewWall.setEndpoints(junction.start, junction.end);
    }

    if (this.wallPlacementError) {
      this.wallPlacementError = null;
      this.notify();
    }
  }

  // --------------------------------
  // Opening placement
  // --------------------------------

  /**
   * Finds the first real wall under the pointer and converts the hit into a
   * position along that wall. Openings already placed in the wall are skipped
   * so the user can keep aiming at the wall behind them.
   */
  private pickWallSurface(event: PointerEvent): WallSurfaceHit | null {
    const intersections = this.raycastComponent.castWorldMeshes(event);

    for (const intersection of intersections) {
      const object = intersection.object;

      if (object instanceof WallMesh && !object.isPreview) {
        const raw = object.getDistanceAlongWall(intersection.point);

        return {
          wall: object,
          distanceAlongWall: Math.round(raw / OPENING_SNAP) * OPENING_SNAP,
        };
      }
    }

    return null;
  }

  private handleOpeningPlacementMove(
    event: PointerEvent,
    type: OpeningType,
  ): void {
    const hit = this.pickWallSurface(event);

    if (!hit) {
      if (this.clearOpeningPreview()) {
        this.notify();
      }
      return;
    }

    const params = createDefaultOpeningParams(type, hit.distanceAlongWall);

    this.showOpeningPreview(type, hit.wall, params);
  }

  private showOpeningPreview(
    type: OpeningType,
    wall: WallMesh,
    params: OpeningParams,
  ): void {
    if (this.previewOpening && this.previewOpening.type !== type) {
      this.clearOpeningPreview();
    }

    let needsRebuild = false;

    if (!this.previewOpening) {
      this.previewOpening = createOpening(type, params, true);
      needsRebuild = true;
    }

    if (this.previewOpeningWall !== wall) {
      this.previewOpeningWall?.remove(this.previewOpening);
      wall.add(this.previewOpening);
      this.previewOpening.setWall(wall);
      this.previewOpeningWall = wall;
      needsRebuild = true;
    }

    if (needsRebuild) {
      // Geometry depends on the host wall's thickness and length.
      this.previewOpening.setParams(params);
      this.previewOpening.build();
    } else {
      // Sliding along the same wall only needs a transform update.
      this.previewOpening.setDistanceAlongWall(params.distanceAlongWall);
    }

    this.refreshOpeningPreviewValidity();
  }

  private refreshOpeningPreviewValidity(): void {
    const preview = this.previewOpening;
    const wall = this.previewOpeningWall;

    if (!preview || !wall) return;

    const validation = wall.canPlaceOpening(preview.getParams());
    const message = validation.valid ? null : validation.reason;

    preview.setPreviewValid(validation.valid);

    if (
      this.openingPreviewValid !== validation.valid ||
      this.openingPreviewMessage !== message
    ) {
      this.openingPreviewValid = validation.valid;
      this.openingPreviewMessage = message;
      this.notify();
    }
  }

  /**
   * Removes the opening ghost. Returns true when something actually changed.
   */
  private clearOpeningPreview(): boolean {
    const hadPreview = this.previewOpening !== null;

    if (this.previewOpening) {
      this.previewOpeningWall?.remove(this.previewOpening);
      this.previewOpening.setWall(null);
      this.previewOpening.dispose();
    }

    this.previewOpening = null;
    this.previewOpeningWall = null;

    const hadMessage = this.openingPreviewMessage !== null;

    this.openingPreviewValid = false;
    this.openingPreviewMessage = null;

    return hadPreview || hadMessage;
  }

  private handleOpeningPlacementClick(
    event: PointerEvent,
    type: OpeningType,
  ): void {
    const hit = this.pickWallSurface(event);

    if (!hit) return;

    const params = createDefaultOpeningParams(type, hit.distanceAlongWall);
    const opening = createOpening(type, params, false);

    if (!hit.wall.addOpening(opening)) {
      // Invalid placement leaves the wall completely untouched.
      opening.dispose();
      this.refreshOpeningPreviewValidity();
      return;
    }

    this.world.meshes.add(opening);

    // The ghost now overlaps the opening that was just placed.
    this.refreshOpeningPreviewValidity();
    this.notify();
  }

  private handleSelectionMove(event: PointerEvent): void {
    this.setHover(this.pickSelectable(event));
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.enabled) return;

    if (this.activeResizeDrag) {
      return;
    }

    if (!this.pointerDownPos) return;

    const dragDist = Math.hypot(
      event.clientX - this.pointerDownPos.x,
      event.clientY - this.pointerDownPos.y,
    );

    this.pointerDownPos = null;

    // Ignore drag events (e.g. OrbitControls navigation)
    if (dragDist > 5) return;

    const openingType = getOpeningTypeForMode(this.mode);

    if (this.mode === 'add-wall') {
      this.handleWallPlacementClick(event);
    } else if (openingType) {
      this.handleOpeningPlacementClick(event, openingType);
    } else if (this.mode === 'select') {
      this.handleSelectionClick(event);
    }
  };

  private handleWallPlacementClick(event: PointerEvent): void {
    const cell = this.gridComponent.getCellFromPointer(event);
    if (!cell) return;

    const clickPos = this.gridComponent.getCellPosition(cell);

    if (this.placementState === 'idle') {
      this.wallPlacementError = null;
      this.startPoint = clickPos;
      this.placementState = 'picking-end';

      // Create initial preview wall
      this.previewWall = new WallMesh({
        startPoint: clickPos,
        endPoint: clickPos,
        height: this.defaultHeight,
        width: this.defaultWidth,
        isPreview: true,
      });
      this.world.scene.add(this.previewWall);

      this.notify();
    } else if (this.placementState === 'picking-end' && this.startPoint) {
      const junction = calculateWallJunctions(
        this.startPoint,
        clickPos,
        this.defaultWidth,
        this.walls,
      );

      const length = junction.start.distanceTo(junction.end);

      if (length <= 0.05) {
        this.wallPlacementError = 'Wall is too short.';
        this.notify();
        return;
      }

      if (
        wouldWallOverlapExisting(
          junction.start,
          junction.end,
          this.defaultWidth,
          this.walls,
        )
      ) {
        this.wallPlacementError =
          'Wall overlaps an existing wall. Choose a different endpoint.';
        this.notify();
        return;
      }

      // Place permanent wall
      const newWall = new WallMesh({
        startPoint: junction.start,
        endPoint: junction.end,
        height: this.defaultHeight,
        width: this.defaultWidth,
        isPreview: false,
      });

      newWall.onOpeningsRemoved = this.handleOpeningsRemoved;

      this.walls.add(newWall);
      this.world.scene.add(newWall);
      this.world.meshes.add(newWall);
      this.wallPlacementError = null;
      this.rebuildRoomLabels();

      // Cleanup preview
      this.cancelPlacement();
      this.notify();
    }
  }

  /**
   * Returns the wall or opening under the pointer, openings taking precedence
   * because they sit inside the wall's hole.
   */
  private pickSelectable(event: PointerEvent): Selectable | null {
    const intersections = this.raycastComponent.castWorldMeshes(event);

    for (const intersection of intersections) {
      const object = intersection.object;

      if (object instanceof Opening && !object.isPreview) {
        return object;
      }

      if (object instanceof WallMesh && !object.isPreview) {
        return object;
      }
    }

    return null;
  }

  private handleSelectionClick(event: PointerEvent): void {
    this.setSelection(this.pickSelectable(event));
  }

  private handlePointerLeave = (): void => {
    if (this.activeResizeDrag) {
      this.endResizeDrag();
      this.notify();
    }

    this.setHoveredResizeHandle(null);

    const previewChanged = this.clearOpeningPreview();
    const hadHover = this.hoveredWall !== null || this.hoveredOpening !== null;

    // setHover notifies on its own when the hover target actually changed.
    this.setHover(null);

    if (previewChanged && !hadHover) {
      this.notify();
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.placementState === 'picking-end') {
        this.cancelPlacement();
        this.notify();
      } else if (this.previewOpening) {
        this.clearOpeningPreview();
        this.notify();
      } else if (this.selectedWall || this.selectedOpening) {
        this.setSelection(null);
      }
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      // Avoid deleting if user is typing in an input field
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isInput) return;

      if (this.selectedOpening) {
        this.deleteSelectedOpening();
      } else if (this.selectedWall) {
        this.deleteSelectedWall();
      }
    }
  };

  // --------------------------------
  // Selection / hover
  // --------------------------------

  private setSelection(target: Selectable | null): void {
    const current: Selectable | null =
      this.selectedOpening ?? this.selectedWall;

    if (current === target) return;

    current?.setSelected(false);

    this.selectedWall = target instanceof WallMesh ? target : null;
    this.selectedOpening = target instanceof Opening ? target : null;
    this.openingEditError = null;
    this.resizeError = null;

    if (!this.selectedWall) {
      this.endResizeDrag();
      this.setHoveredResizeHandle(null);
    }

    target?.setSelected(true);

    this.updateResizeHandlesVisibility();
    this.updateResizeHandlesForSelection();

    this.notify();
  }

  private setHover(target: Selectable | null): void {
    const current: Selectable | null = this.hoveredOpening ?? this.hoveredWall;

    if (current === target) return;

    if (current && !current.isSelected) {
      current.setHovered(false);
    }

    this.hoveredWall = target instanceof WallMesh ? target : null;
    this.hoveredOpening = target instanceof Opening ? target : null;

    if (target && !target.isSelected) {
      target.setHovered(true);
    }

    this.notify();
  }

  private cancelPlacement(): void {
    this.placementState = 'idle';
    this.startPoint = null;

    if (this.previewWall) {
      this.world.scene.remove(this.previewWall);
      this.previewWall.dispose();
      this.previewWall = null;
    }
  }

  dispose(): void {
    const canvas = this.world.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    window.removeEventListener('keydown', this.handleKeyDown);

    this.cancelPlacement();
    this.clearOpeningPreview();
    this.setSelection(null);
    this.endResizeDrag();
    this.setHoveredResizeHandle(null);
    this.clearRoomLabels();

    for (const handle of this.resizeHandles) {
      this.world.scene.remove(handle.mesh);
      handle.mesh.geometry.dispose();
      handle.mesh.material.dispose();
    }
    this.resizeHandles = [];

    for (const wall of this.walls) {
      for (const opening of wall.openings) {
        this.world.meshes.delete(opening);
      }

      this.world.removeMesh(wall);
      wall.dispose();
    }
    this.walls.clear();

    if (this.ambientLight) {
      this.world.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
    }

    if (this.directionalLight) {
      this.world.scene.remove(this.directionalLight);
      this.directionalLight.dispose();
    }

    this.listeners.clear();
  }
}
