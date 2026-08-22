import * as THREE from 'three';

import { Component } from '../engine/Component';
import type { World } from '../engine/World';
import { GridComponent } from './GridComponent';
import { RaycastComponent } from './RaycastComponent';
import { FloorPlanComponent } from './FloorPlanComponent';
import { ModelStore } from '../model/ModelStore';
import type { MeshObject } from '../model/MeshObject';
import { Emitter } from '../model/Emitter';

import type { EditorTool } from './tools/EditorTool';
import { SelectionTool } from './tools/SelectionTool';
import { WallTool } from './tools/WallTool';
import { RoomTool } from './tools/RoomTool';

export type ToolMode = 'select' | 'wall' | 'room';

export interface EditorState {
  mode: ToolMode;
  floorPlan: boolean;
  selectedId: string | null;
  selectedType: string | null;
  selectedName: string | null;
  selectedWidth: number | null;
  selectedHeight: number | null;
  rooms: { id: string; name: string }[];
  wallCount: number;
}

/**
 * The editor "controller".
 *
 * Owns the model store, the set of interaction tools, the current
 * selection and mode, and forwards pointer events to the active tool.
 * All interaction logic lives here (and in the tool classes) rather
 * than in App.tsx. UI observes state via the `stateChanged` emitter.
 */
export class EditorComponent extends Component {
  readonly stateChanged = new Emitter<EditorState>();

  readonly model: ModelStore;

  readonly defaultWallHeight = 3;

  readonly defaultWallThickness = 0.2;

  private grid!: GridComponent;

  raycaster!: RaycastComponent;

  /** Public accessor so tools can add transient previews to the scene. */
  getScene(): THREE.Scene {
    return this.editorWorld.scene;
  }

  private floorPlan?: FloorPlanComponent;

  private tools = new Map<ToolMode, EditorTool>();

  private activeTool!: EditorTool;

  private mode: ToolMode = 'select';

  private selected: MeshObject | null = null;

  private readonly editorWorld: World;

  constructor(world: World) {
    super(world);
    this.editorWorld = world;
    this.model = new ModelStore(
      (wall) => this.world.addMesh(wall.mesh),
      (wall) => this.world.removeMesh(wall.mesh),
    );
  }

  init(): void {
    this.grid = this.world.get(GridComponent);
    this.raycaster = this.world.get(RaycastComponent);

    if (this.world.has(FloorPlanComponent)) {
      this.floorPlan = this.world.get(FloorPlanComponent);
      this.floorPlan.setModel(this.model);
    }

    this.tools.set('select', new SelectionTool(this));
    this.tools.set('wall', new WallTool(this));
    this.tools.set('room', new RoomTool(this));

    this.activeTool = this.tools.get('select')!;
    this.activeTool.activate();

    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerdown', this.handlePointerDown);

    // Rebuild floor plan (if visible) and refresh UI on model changes.
    this.model.changed.on(() => {
      this.floorPlan?.refresh();
      this.emitState();
    });

    this.emitState();
  }

  // ----- public API used by tools -----

  getCornerFromPointer(event: PointerEvent): THREE.Vector3 | null {
    return this.grid.getCornerFromPointer(event);
  }

  getSelected(): MeshObject | null {
    return this.selected;
  }

  // ----- public API used by the UI -----

  setMode(mode: ToolMode): void {
    if (mode === this.mode) {
      return;
    }
    // Cannot use modeling tools in floor-plan (2D) mode.
    if (this.floorPlan?.isActive() && mode !== 'select') {
      return;
    }
    this.activeTool.deactivate();
    if (mode !== 'select') {
      this.select(null);
    }
    this.mode = mode;
    this.activeTool = this.tools.get(mode)!;
    this.activeTool.activate();
    this.emitState();
  }

  getMode(): ToolMode {
    return this.mode;
  }

  select(object: MeshObject | null): void {
    if (this.selected === object) {
      return;
    }
    if (this.selected) {
      this.selected.setSelected(false);
      this.selected.setHovered(false);
    }
    this.selected = object;
    if (object) {
      object.setSelected(true);
    }
    this.emitState();
  }

  setSelectedHeight(height: number): void {
    if (!this.selected || this.selected.type !== 'Wall') {
      return;
    }
    // Wall exposes setHeight; route via model to refresh plan/state.
    this.model.updateWallHeight(this.selected as never, height);
    this.emitState();
  }

  toggleFloorPlan(): boolean {
    if (!this.floorPlan) {
      return false;
    }
    const active = this.floorPlan.toggle();
    if (active) {
      // Force select mode / clear selection when going 2D.
      this.setMode('select');
      this.select(null);
    }
    this.emitState();
    return active;
  }

  getState(): EditorState {
    const wall =
      this.selected && this.selected.type === 'Wall'
        ? (this.selected as unknown as {
            length: number;
            height: number;
            thickness: number;
          })
        : null;
    return {
      mode: this.mode,
      floorPlan: this.floorPlan?.isActive() ?? false,
      selectedId: this.selected?.id ?? null,
      selectedType: this.selected?.type ?? null,
      selectedName: this.selected?.name ?? null,
      selectedWidth: wall ? wall.length : null,
      selectedHeight: wall ? wall.height : null,
      rooms: this.model.rooms.map((r) => ({ id: r.id, name: r.name })),
      wallCount: this.model.walls.length,
    };
  }

  private emitState(): void {
    this.stateChanged.emit(this.getState());
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled) {
      return;
    }
    this.activeTool.onPointerMove(event);
  };

  private downPos = new THREE.Vector2();

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) {
      return;
    }
    this.downPos.set(event.clientX, event.clientY);
    const canvas = this.world.renderer.domElement;
    const up = (upEvent: PointerEvent) => {
      canvas.removeEventListener('pointerup', up);
      const moved =
        Math.abs(upEvent.clientX - this.downPos.x) +
        Math.abs(upEvent.clientY - this.downPos.y);
      // Ignore drags (camera orbit) — only treat clean clicks as clicks.
      if (moved < 5) {
        this.activeTool.onPointerDown(upEvent);
      }
    };
    canvas.addEventListener('pointerup', up);
  };

  dispose(): void {
    const canvas = this.world.renderer.domElement;
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);

    for (const tool of this.tools.values()) {
      tool.deactivate();
      const disposable = tool as unknown as { disposePreview?: () => void };
      disposable.disposePreview?.();
    }
    this.tools.clear();

    this.model.dispose();
    this.stateChanged.clear();
    this.selected = null;
  }
}
