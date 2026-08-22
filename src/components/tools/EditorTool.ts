import type { EditorComponent } from '../EditorComponent';

/**
 * A tool encapsulates one interaction mode (add wall, add room, ...).
 *
 * The EditorComponent activates at most one tool at a time and forwards
 * pointer events to it. Tools live in their own files so new modeling
 * features can be added without touching existing tool logic.
 */
export interface EditorTool {
  readonly id: string;

  /** Called when the tool becomes active. */
  activate(): void;

  /** Called when the tool is deactivated (cleanup transient previews). */
  deactivate(): void;

  onPointerMove(event: PointerEvent): void;

  onPointerDown(event: PointerEvent): void;
}

export abstract class BaseTool implements EditorTool {
  abstract readonly id: string;

  protected readonly editor: EditorComponent;

  constructor(editor: EditorComponent) {
    this.editor = editor;
  }

  activate(): void {}

  deactivate(): void {}

  onPointerMove(_event: PointerEvent): void {}

  onPointerDown(_event: PointerEvent): void {}
}
