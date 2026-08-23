import * as THREE from 'three';
import { Component } from '../engine/Component';
import { GridComponent } from './GridComponent';
import { RaycastComponent } from './RaycastComponent';
import { WallMesh } from '../objects/WallMesh';
import { calculateWallJunctions } from '../utils/junctions';

export type ToolMode = 'select' | 'add-wall';
export type PlacementState = 'idle' | 'picking-end';

export class WallToolComponent extends Component {
  mode: ToolMode = 'select';
  placementState: PlacementState = 'idle';

  readonly walls = new Set<WallMesh>();
  selectedWall: WallMesh | null = null;
  hoveredWall: WallMesh | null = null;

  defaultHeight = 3.0;
  defaultWidth = 0.3;

  private gridComponent!: GridComponent;
  private raycastComponent!: RaycastComponent;

  private startPoint: THREE.Vector3 | null = null;
  private previewWall: WallMesh | null = null;

  private pointerDownPos: { x: number; y: number } | null = null;

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

    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  setMode(mode: ToolMode): void {
    if (this.mode === mode) return;

    // Clear placement preview if leaving add-wall
    if (this.mode === 'add-wall') {
      this.cancelPlacement();
    }

    // Clear hover/selected state if entering add-wall
    if (mode === 'add-wall') {
      this.clearHover();
      this.deselectWall();
    }

    this.mode = mode;
    this.notify();
  }

  setSelectedWallHeight(height: number): void {
    if (this.selectedWall && height > 0) {
      this.selectedWall.setHeight(height);
      this.notify();
    }
  }

  setSelectedWallWidth(width: number): void {
    if (this.selectedWall && width > 0) {
      this.selectedWall.setWidth(width);
      // Recalculate preview / junctions if needed, but for existing wall update geometry
      this.notify();
    }
  }

  deleteSelectedWall(): void {
    if (!this.selectedWall) return;

    const wallToDelete = this.selectedWall;
    this.deselectWall();

    this.walls.delete(wallToDelete);
    this.world.removeMesh(wallToDelete);
    wallToDelete.dispose();

    this.notify();
  }

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

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;

    if (this.mode === 'add-wall') {
      this.handleWallPlacementMove(event);
    } else if (this.mode === 'select') {
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
  }

  private handleSelectionMove(event: PointerEvent): void {
    const intersections = this.raycastComponent.castWorldMeshes(event);

    if (intersections.length > 0) {
      const hitObj = intersections[0].object;
      if (hitObj instanceof WallMesh && !hitObj.isPreview) {
        if (this.hoveredWall !== hitObj) {
          this.clearHover();
          this.hoveredWall = hitObj;
          if (!hitObj.isSelected) {
            hitObj.setHovered(true);
          }
          this.notify();
        }
        return;
      }
    }

    if (this.hoveredWall) {
      this.clearHover();
      this.notify();
    }
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.enabled || !this.pointerDownPos) return;

    const dragDist = Math.hypot(
      event.clientX - this.pointerDownPos.x,
      event.clientY - this.pointerDownPos.y,
    );

    this.pointerDownPos = null;

    // Ignore drag events (e.g. OrbitControls navigation)
    if (dragDist > 5) return;

    if (this.mode === 'add-wall') {
      this.handleWallPlacementClick(event);
    } else if (this.mode === 'select') {
      this.handleSelectionClick(event);
    }
  };

  private handleWallPlacementClick(event: PointerEvent): void {
    const cell = this.gridComponent.getCellFromPointer(event);
    if (!cell) return;

    const clickPos = this.gridComponent.getCellPosition(cell);

    if (this.placementState === 'idle') {
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

      if (length > 0.05) {
        // Place permanent wall
        const newWall = new WallMesh({
          startPoint: junction.start,
          endPoint: junction.end,
          height: this.defaultHeight,
          width: this.defaultWidth,
          isPreview: false,
        });

        this.walls.add(newWall);
        this.world.scene.add(newWall);
        this.world.meshes.add(newWall);
      }

      // Cleanup preview
      this.cancelPlacement();
      this.notify();
    }
  }

  private handleSelectionClick(event: PointerEvent): void {
    const intersections = this.raycastComponent.castWorldMeshes(event);

    if (intersections.length > 0) {
      const hitObj = intersections[0].object;
      if (hitObj instanceof WallMesh && !hitObj.isPreview) {
        this.selectWall(hitObj);
        return;
      }
    }

    // Clicked empty space
    this.deselectWall();
  }

  private handlePointerLeave = (): void => {
    if (this.hoveredWall) {
      this.clearHover();
      this.notify();
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.placementState === 'picking-end') {
        this.cancelPlacement();
        this.notify();
      } else if (this.selectedWall) {
        this.deselectWall();
      }
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      // Avoid deleting if user is typing in an input field
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (!isInput && this.selectedWall) {
        this.deleteSelectedWall();
      }
    }
  };

  private selectWall(wall: WallMesh): void {
    if (this.selectedWall === wall) return;

    if (this.selectedWall) {
      this.selectedWall.setSelected(false);
    }

    this.selectedWall = wall;
    wall.setSelected(true);
    this.notify();
  }

  private deselectWall(): void {
    if (this.selectedWall) {
      this.selectedWall.setSelected(false);
      this.selectedWall = null;
      this.notify();
    }
  }

  private clearHover(): void {
    if (this.hoveredWall) {
      if (!this.hoveredWall.isSelected) {
        this.hoveredWall.setHovered(false);
      }
      this.hoveredWall = null;
    }
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
    this.deselectWall();

    for (const wall of this.walls) {
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
