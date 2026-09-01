import * as THREE from 'three';
import { Component } from '../engine/Component';
import { GridComponent } from './GridComponent';
import { RaycastComponent } from './RaycastComponent';
import { WallMesh } from '../objects/WallMesh';
import { Opening } from '../objects/openings/Opening';
import { WindowMesh } from '../objects/openings/WindowMesh';
import { DoorMesh } from '../objects/openings/DoorMesh';
import {
  createDefaultOpeningParams,
  createOpening,
} from '../objects/openings/OpeningFactory';
import {
  calculateWallJunctions,
  wouldWallOverlapExisting,
} from '../utils/junctions';
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
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
}

interface ResizeDragState {
  wall: WallMesh;
  kind: ResizeHandleKind;
}

const MIN_WALL_LENGTH = 0.05;
const NODE_RADIUS = 0.12;
const GUMBALL_RADIUS = 0.095;
const END_GRIP_LENGTH = 0.2;
const RESIZE_HANDLE_HEIGHT = 0.05;
const RESIZE_NODE_COLOR = 0xe2e8f0;
const RESIZE_NODE_HOVER_COLOR = 0x93c5fd;
const RESIZE_NODE_ACTIVE_COLOR = 0x2563eb;
const GUMBALL_COLOR = 0x0ea5e9;
const GUMBALL_HOVER_COLOR = 0x0284c7;
const ENDPOINT_PICK_RADIUS = 0.35;

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
  private hoveredGumball = false;
  private activeResizeHandle: ResizeHandle | null = null;
  private activeResizeDrag: ResizeDragState | null = null;
  private resizeHandles: ResizeHandle[] = [];
  private gumballHandle:
    | THREE.Mesh<THREE.ConeGeometry, THREE.MeshStandardMaterial>
    | null = null;
  private resizeAxisLine: THREE.Line<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  > | null = null;

  private ambientLight?: THREE.AmbientLight;
  private hemiLight?: THREE.HemisphereLight;
  private directionalLight?: THREE.DirectionalLight;
  private fillLight?: THREE.DirectionalLight;

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

  // --------------------------------
  // Wall properties
  // --------------------------------

  setSelectedWallMaterial(material: THREE.Material, materialId?: string): void {
    if (this.selectedWall) {
      this.selectedWall.setPreviewMaterial(null);
      this.selectedWall.setCustomMaterial(material, materialId);
      this.notify();
    }
  }

  previewWallMaterial(material: THREE.Material | null): void {
    if (this.selectedWall) {
      this.selectedWall.setPreviewMaterial(material);
      this.notify();
    }
  }

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

    this.notify();
  }

  // --------------------------------
  // Opening properties
  // --------------------------------

  setSelectedOpeningGlassMaterial(material: THREE.Material, materialId?: string): void {
    if (this.selectedOpening instanceof WindowMesh) {
      this.selectedOpening.setPreviewMaterial(null);
      this.selectedOpening.setGlassMaterial(material, materialId);
      this.notify();
    }
  }

  previewOpeningGlassMaterial(material: THREE.Material | null): void {
    if (this.selectedOpening instanceof WindowMesh) {
      this.selectedOpening.setPreviewMaterial(material);
      this.notify();
    }
  }

  setSelectedOpeningLeafMaterial(material: THREE.Material, materialId?: string): void {
    if (this.selectedOpening instanceof DoorMesh) {
      this.selectedOpening.setPreviewMaterial(null);
      this.selectedOpening.setLeafMaterial(material, materialId);
      this.notify();
    }
  }

  previewOpeningLeafMaterial(material: THREE.Material | null): void {
    if (this.selectedOpening instanceof DoorMesh) {
      this.selectedOpening.setPreviewMaterial(material);
      this.notify();
    }
  }

  setSelectedOpeningFrameMaterial(material: THREE.Material, materialId?: string): void {
    if (this.selectedOpening instanceof WindowMesh || this.selectedOpening instanceof DoorMesh) {
      this.selectedOpening.setFrameMaterial(material, materialId);
      this.notify();
    }
  }

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
      this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.65);
      this.hemiLight.position.set(0, 50, 0);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);

      this.directionalLight = new THREE.DirectionalLight(0xfffaed, 1.5);
      this.directionalLight.position.set(25, 35, 20);
      this.directionalLight.castShadow = true;
      this.directionalLight.shadow.mapSize.width = 2048;
      this.directionalLight.shadow.mapSize.height = 2048;
      this.directionalLight.shadow.camera.near = 0.5;
      this.directionalLight.shadow.camera.far = 150;
      this.directionalLight.shadow.camera.left = -40;
      this.directionalLight.shadow.camera.right = 40;
      this.directionalLight.shadow.camera.top = 40;
      this.directionalLight.shadow.camera.bottom = -40;
      this.directionalLight.shadow.bias = -0.0001;
      this.directionalLight.shadow.normalBias = 0.02;

      this.fillLight = new THREE.DirectionalLight(0x94a3b8, 0.45);
      this.fillLight.position.set(-20, 15, -15);

      this.world.scene.add(this.hemiLight);
      this.world.scene.add(this.ambientLight);
      this.world.scene.add(this.directionalLight);
      this.world.scene.add(this.fillLight);
    }
  }

  private createResizeHandles(): void {
    const makeHandle = (kind: ResizeHandleKind): ResizeHandle => {
      const geometry = new THREE.SphereGeometry(NODE_RADIUS, 18, 18);
      const material = new THREE.MeshStandardMaterial({
        color: RESIZE_NODE_COLOR,
        roughness: 0.7,
        metalness: 0.0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 500;
      this.world.scene.add(mesh);
      return { kind, mesh };
    };

    this.resizeHandles = [makeHandle('start'), makeHandle('end')];

    this.gumballHandle = new THREE.Mesh(
      new THREE.ConeGeometry(GUMBALL_RADIUS, END_GRIP_LENGTH, 20),
      new THREE.MeshStandardMaterial({
        color: GUMBALL_COLOR,
        roughness: 0.45,
        metalness: 0.05,
      }),
    );
    this.gumballHandle.visible = false;
    this.gumballHandle.renderOrder = 550;
    this.world.scene.add(this.gumballHandle);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.8,
    });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.resizeAxisLine = new THREE.Line(lineGeometry, lineMaterial);
    this.resizeAxisLine.visible = false;
    this.resizeAxisLine.renderOrder = 450;
    this.world.scene.add(this.resizeAxisLine);
  }

  private updateResizeHandlesVisibility(): void {
    const visible =
      this.mode === 'select' && this.resizeMode && this.selectedWall !== null;

    for (const handle of this.resizeHandles) {
      handle.mesh.visible = visible;
    }
    if (this.resizeAxisLine) {
      this.resizeAxisLine.visible = visible && this.activeResizeHandle !== null;
    }
    if (this.gumballHandle) {
      this.gumballHandle.visible = visible && this.activeResizeHandle !== null;
    }

    if (!visible) {
      this.hoveredResizeHandle = null;
      this.hoveredGumball = false;
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

    const axisStart = wall.startPoint.clone().setY(RESIZE_HANDLE_HEIGHT);
    const axisEnd = wall.endPoint.clone().setY(RESIZE_HANDLE_HEIGHT);

    const direction = axisEnd.clone().sub(axisStart).normalize();
    const invertDirection = direction.clone().multiplyScalar(-1);

    if (this.resizeAxisLine) {
      this.resizeAxisLine.geometry.dispose();
      this.resizeAxisLine.geometry = new THREE.BufferGeometry().setFromPoints([
        axisStart,
        axisEnd,
      ]);
      this.resizeAxisLine.visible = this.activeResizeHandle !== null;
    }

    for (const handle of this.resizeHandles) {
      if (handle.kind === 'start') {
        handle.mesh.position.copy(axisStart);
      } else {
        handle.mesh.position.copy(axisEnd);
      }
    }

    if (this.activeResizeHandle && this.gumballHandle) {
      const activeAtStart = this.activeResizeHandle.kind === 'start';
      const origin = activeAtStart ? axisStart : axisEnd;
      const axisDir = activeAtStart ? invertDirection : direction;

      this.gumballHandle.visible = true;
      this.gumballHandle.position.copy(origin);
      this.gumballHandle.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        axisDir,
      );

      const offset = axisDir.clone().multiplyScalar(END_GRIP_LENGTH * 0.55);
      this.gumballHandle.position.add(offset);
    } else if (this.gumballHandle) {
      this.gumballHandle.visible = false;
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

  private pickWallEndHandle(event: PointerEvent): ResizeHandle | null {
    const wall = this.selectedWall;

    if (!this.resizeMode || !wall) {
      return null;
    }

    const intersections = this.raycastComponent.castObject(event, wall, false);
    if (intersections.length === 0) {
      return null;
    }

    const hit = intersections[0].point;
    const hitFlat = new THREE.Vector3(hit.x, 0, hit.z);
    const start = wall.startPoint.clone().setY(0);
    const end = wall.endPoint.clone().setY(0);

    const distToStart = hitFlat.distanceTo(start);
    const distToEnd = hitFlat.distanceTo(end);
    const pickRadius = Math.max(ENDPOINT_PICK_RADIUS, wall.width * 1.5);

    if (distToStart > pickRadius && distToEnd > pickRadius) {
      return null;
    }

    const kind: ResizeHandleKind = distToStart <= distToEnd ? 'start' : 'end';
    return this.resizeHandles.find((handle) => handle.kind === kind) ?? null;
  }

  private isPointerOnGumball(event: PointerEvent): boolean {
    if (!this.gumballHandle || !this.gumballHandle.visible) {
      return false;
    }

    const hits = this.raycastComponent.castObject(event, this.gumballHandle, false);
    return hits.length > 0;
  }

  private setHoveredResizeHandle(handle: ResizeHandle | null): void {
    if (this.hoveredResizeHandle === handle) return;

    this.hoveredResizeHandle = handle;
    this.updateResizeHandleStyles();
  }

  private setHoveredGumball(hovered: boolean): void {
    if (this.hoveredGumball === hovered) return;
    this.hoveredGumball = hovered;
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
    this.activeResizeDrag = null;
    this.hoveredGumball = false;
    this.updateResizeHandleStyles();
  }

  private updateResizeHandleStyles(): void {
    for (const handle of this.resizeHandles) {
      let color = RESIZE_NODE_COLOR;
      let scale = 1;

      if (handle === this.activeResizeHandle) {
        color = RESIZE_NODE_ACTIVE_COLOR;
        scale = 1.16;
      } else if (handle === this.hoveredResizeHandle) {
        color = RESIZE_NODE_HOVER_COLOR;
        scale = 1.08;
      }

      handle.mesh.material.color.setHex(color);
      handle.mesh.scale.setScalar(scale);
    }

    if (this.gumballHandle) {
      this.gumballHandle.material.color.setHex(
        this.hoveredGumball ? GUMBALL_HOVER_COLOR : GUMBALL_COLOR,
      );
      this.gumballHandle.scale.setScalar(this.activeResizeDrag ? 1.12 : 1);
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
      this.resizeError = null;
      return true;
    }

    return false;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;

    if (this.mode === 'select' && this.resizeMode) {
      if (this.activeResizeDrag) {
        this.endResizeDrag();
        this.updateResizeHandlesForSelection();
        this.notify();
        return;
      }

      const node = this.pickResizeHandle(event) ?? this.pickWallEndHandle(event);
      if (node) {
        this.activeResizeHandle = node;
        this.resizeError = null;
        this.updateResizeHandlesForSelection();
        this.updateResizeHandleStyles();
        this.notify();
        return;
      }

      if (this.activeResizeHandle && this.isPointerOnGumball(event)) {
        this.startResizeDrag(this.activeResizeHandle);
        this.updateResizeHandlesForSelection();
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
        this.setHoveredGumball(this.isPointerOnGumball(event));
      } else {
        this.setHoveredResizeHandle(null);
        this.setHoveredGumball(false);
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
    this.setHoveredGumball(false);

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
    this.activeResizeHandle = null;

    if (!this.selectedWall) {
      this.endResizeDrag();
      this.setHoveredResizeHandle(null);
      this.setHoveredGumball(false);
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

    for (const handle of this.resizeHandles) {
      this.world.scene.remove(handle.mesh);
      handle.mesh.geometry.dispose();
      handle.mesh.material.dispose();
    }
    this.resizeHandles = [];

    if (this.resizeAxisLine) {
      this.world.scene.remove(this.resizeAxisLine);
      this.resizeAxisLine.geometry.dispose();
      this.resizeAxisLine.material.dispose();
      this.resizeAxisLine = null;
    }

    for (const wall of this.walls) {
      for (const opening of wall.openings) {
        this.world.meshes.delete(opening);
      }

      this.world.removeMesh(wall);
      wall.dispose();
    }
    this.walls.clear();

    if (this.hemiLight) {
      this.world.scene.remove(this.hemiLight);
      this.hemiLight.dispose();
    }

    if (this.ambientLight) {
      this.world.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
    }

    if (this.directionalLight) {
      this.world.scene.remove(this.directionalLight);
      this.directionalLight.dispose();
    }

    if (this.fillLight) {
      this.world.scene.remove(this.fillLight);
      this.fillLight.dispose();
    }

    this.listeners.clear();
  }
}
