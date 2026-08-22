import { BaseTool } from './EditorTool';
import { MeshObject } from '../../model/MeshObject';

/**
 * Default (no active tool) mode.
 *
 * Walls become hoverable and selectable. Selection state is stored on
 * the EditorComponent so the UI can display / edit the selected object.
 */
export class SelectionTool extends BaseTool {
  readonly id = 'select';

  private hovered: MeshObject | null = null;

  activate(): void {
    this.hovered = null;
  }

  deactivate(): void {
    if (this.hovered) {
      this.hovered.setHovered(false);
      this.hovered = null;
    }
  }

  onPointerMove(event: PointerEvent): void {
    const object = this.pick(event);
    if (object === this.hovered) {
      return;
    }
    if (this.hovered && this.hovered !== this.editor.getSelected()) {
      this.hovered.setHovered(false);
    }
    this.hovered = object;
    if (object && object !== this.editor.getSelected()) {
      object.setHovered(true);
    }
  }

  onPointerDown(event: PointerEvent): void {
    const object = this.pick(event);
    this.editor.select(object);
  }

  private pick(event: PointerEvent): MeshObject | null {
    const hits = this.editor.raycaster.castWorldMeshes(event);
    for (const hit of hits) {
      const obj = hit.object.userData.modelObject;
      if (obj instanceof MeshObject) {
        return obj;
      }
    }
    return null;
  }
}
