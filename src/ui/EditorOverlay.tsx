import { useEffect, useState } from 'react';

import type { EditorComponent, EditorState } from '../components/EditorComponent';

import './EditorOverlay.css';

interface Props {
  editor: EditorComponent;
}

/**
 * Top-left viewport overlay UI.
 *
 * It is a thin presentational layer: it subscribes to the editor's
 * state emitter and issues commands back to the editor. It contains no
 * interaction / geometry logic itself.
 */
export function EditorOverlay({ editor }: Props) {
  const [state, setState] = useState<EditorState>(() => editor.getState());

  useEffect(() => {
    // Subscribe to editor state changes. The initial value is provided
    // by the useState initializer above, so no synchronous setState is
    // needed here.
    const off = editor.stateChanged.on(setState);
    return off;
  }, [editor]);

  const toolButton = (mode: EditorState['mode'], label: string) => (
    <button
      type="button"
      className={state.mode === mode ? 'tool active' : 'tool'}
      disabled={state.floorPlan && mode !== 'select'}
      onClick={() => editor.setMode(mode)}
    >
      {label}
    </button>
  );

  return (
    <div className="editor-overlay">
      <div className="panel">
        <div className="panel-title">Tools</div>
        <div className="tool-row">
          {toolButton('select', 'Select')}
          {toolButton('wall', 'Add Wall')}
          {toolButton('room', 'Add Room')}
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={state.floorPlan}
            onChange={() => editor.toggleFloorPlan()}
          />
          Floor plan view (2D)
        </label>
      </div>

      {state.selectedType === 'Wall' && (
        <div className="panel">
          <div className="panel-title">Selected {state.selectedType}</div>
          <div className="field">
            <span>Width</span>
            <span>{state.selectedWidth?.toFixed(2)} m</span>
          </div>
          <div className="field">
            <span>Height</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={state.selectedHeight ?? 0}
              onChange={(e) =>
                editor.setSelectedHeight(Number(e.target.value))
              }
            />
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-title">Scene</div>
        <div className="field">
          <span>Walls</span>
          <span>{state.wallCount}</span>
        </div>
        <div className="field">
          <span>Rooms</span>
          <span>{state.rooms.length}</span>
        </div>
        {state.rooms.length > 0 && (
          <ul className="room-list">
            {state.rooms.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
