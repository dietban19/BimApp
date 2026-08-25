import React, { useEffect, useReducer } from 'react';
import type {
  ToolMode,
  WallToolComponent,
} from '../components/WallToolComponent';
import type { WallMesh } from '../objects/WallMesh';
import type { Opening } from '../objects/openings/Opening';
import { OPENING_LABELS, isGroundedOpeningType } from '../types/Opening';
import './UIOverlay.css';

interface UIOverlayProps {
  wallTool: WallToolComponent | null;
}

const MODE_BUTTONS: ReadonlyArray<{ mode: ToolMode; label: string }> = [
  { mode: 'select', label: '🔍 Select' },
  { mode: 'add-wall', label: '🧱 Wall' },
  { mode: 'add-door', label: '🚪 Door' },
  { mode: 'add-window', label: '🪟 Window' },
];

const OPENING_ICONS: Readonly<Record<string, string>> = {
  door: '🚪',
  window: '🪟',
};

function parsePositive(value: string): number | null {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegative(value: string): number | null {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

interface WallInspectorProps {
  wallTool: WallToolComponent;
  wall: WallMesh;
}

const WallInspector: React.FC<WallInspectorProps> = ({ wallTool, wall }) => (
  <div className="ui-inspector">
    <h3 className="ui-section-title">Selected Wall Details</h3>

    <button
      type="button"
      className={`ui-btn ${wallTool.resizeMode ? 'active' : ''}`}
      onClick={() => wallTool.toggleResizeMode()}
    >
      {wallTool.resizeMode ? '✋ Stop Resize' : '↔️ Resize Wall'}
    </button>

    {wallTool.resizeMode && (
      <div className="ui-instruction">
        Click an end node to open the gumball, click the gumball arrow to start
        resize, move the mouse, then click once to finish.
      </div>
    )}

    {wallTool.resizeError && (
      <div className="ui-error-text">{wallTool.resizeError}</div>
    )}

    <div className="ui-field">
      <label htmlFor="wall-height">Height (m):</label>
      <input
        id="wall-height"
        type="number"
        step="0.1"
        min="0.1"
        max="20"
        value={wall.height}
        onChange={(event) => {
          const value = parsePositive(event.target.value);
          if (value !== null) {
            wallTool.setSelectedWallHeight(value);
          }
        }}
      />
    </div>

    <div className="ui-field">
      <label htmlFor="wall-width">Width / Thickness (m):</label>
      <input
        id="wall-width"
        type="number"
        step="0.05"
        min="0.05"
        max="5"
        value={wall.width}
        onChange={(event) => {
          const value = parsePositive(event.target.value);
          if (value !== null) {
            wallTool.setSelectedWallWidth(value);
          }
        }}
      />
    </div>

    <div className="ui-field-readonly">
      <span>Length:</span>
      <strong>{wall.getLength().toFixed(2)} m</strong>
    </div>

    <div className="ui-field-readonly">
      <span>Orientation:</span>
      <strong>{wall.getOrientation().toUpperCase()}-axis</strong>
    </div>

    <div className="ui-field-readonly">
      <span>Openings:</span>
      <strong>{wall.openings.length}</strong>
    </div>

    {wall.openings.length > 0 && (
      <ul className="ui-list">
        {wall.openings.map((opening) => (
          <li key={opening.meshId} className="ui-list-item">
            <span>
              {OPENING_ICONS[opening.type]} {OPENING_LABELS[opening.type]} @{' '}
              {opening.distanceAlongWall.toFixed(2)} m
            </span>
            <button
              type="button"
              className="ui-icon-btn"
              title="Remove this opening"
              onClick={() => wallTool.deleteOpening(opening)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    )}

    <button
      type="button"
      className="ui-btn ui-btn-danger"
      onClick={() => wallTool.deleteSelectedWall()}
    >
      🗑️ Delete Wall
    </button>
  </div>
);

interface OpeningInspectorProps {
  wallTool: WallToolComponent;
  opening: Opening;
}

const OpeningInspector: React.FC<OpeningInspectorProps> = ({
  wallTool,
  opening,
}) => {
  const label = OPENING_LABELS[opening.type];
  const wallLength = opening.wall?.getLength() ?? 0;

  return (
    <div className="ui-inspector">
      <h3 className="ui-section-title">Selected {label} Details</h3>

      <div className="ui-field">
        <label htmlFor="opening-width">Width (m):</label>
        <input
          id="opening-width"
          type="number"
          step="0.05"
          min="0.1"
          max="10"
          value={opening.width}
          onChange={(event) => {
            const value = parsePositive(event.target.value);
            if (value !== null) {
              wallTool.setSelectedOpeningWidth(value);
            }
          }}
        />
      </div>

      <div className="ui-field">
        <label htmlFor="opening-height">Height (m):</label>
        <input
          id="opening-height"
          type="number"
          step="0.05"
          min="0.1"
          max="10"
          value={opening.height}
          onChange={(event) => {
            const value = parsePositive(event.target.value);
            if (value !== null) {
              wallTool.setSelectedOpeningHeight(value);
            }
          }}
        />
      </div>

      {!isGroundedOpeningType(opening.type) && (
        <div className="ui-field">
          <label htmlFor="opening-sill">Sill Height (m):</label>
          <input
            id="opening-sill"
            type="number"
            step="0.05"
            min="0"
            max="10"
            value={opening.sillHeight}
            onChange={(event) => {
              const value = parseNonNegative(event.target.value);
              if (value !== null) {
                wallTool.setSelectedOpeningSillHeight(value);
              }
            }}
          />
        </div>
      )}

      <div className="ui-field">
        <label htmlFor="opening-distance">Position Along Wall (m):</label>
        <input
          id="opening-distance"
          type="number"
          step="0.05"
          min="0"
          max={wallLength}
          value={opening.distanceAlongWall}
          onChange={(event) => {
            const value = parseNonNegative(event.target.value);
            if (value !== null) {
              wallTool.setSelectedOpeningDistance(value);
            }
          }}
        />
      </div>

      {wallTool.openingEditError && (
        <div className="ui-error-text">{wallTool.openingEditError}</div>
      )}

      <button
        type="button"
        className="ui-btn ui-btn-danger"
        onClick={() => wallTool.deleteSelectedOpening()}
      >
        🗑️ Delete {label}
      </button>
    </div>
  );
};

export const UIOverlay: React.FC<UIOverlayProps> = ({ wallTool }) => {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!wallTool) return;

    const unsubscribe = wallTool.subscribe(() => {
      forceUpdate();
    });

    return () => {
      unsubscribe();
    };
  }, [wallTool]);

  if (!wallTool) {
    return null;
  }

  const mode = wallTool.mode;
  const isAddWall = mode === 'add-wall';
  const isSelect = mode === 'select';
  const isAddDoor = mode === 'add-door';
  const isAddWindow = mode === 'add-window';
  const isOpeningMode = isAddDoor || isAddWindow;
  const openingLabel = isAddDoor ? 'door' : 'window';

  const selectedWall = wallTool.selectedWall;
  const selectedOpening = wallTool.selectedOpening;

  return (
    <div className="ui-overlay-container">
      <div className="ui-card">
        <div className="ui-header">
          <h2 className="ui-title">Modeling Tools</h2>
        </div>

        {/* Mode Selector Toggle */}
        <div className="ui-mode-toggle">
          {MODE_BUTTONS.map((button) => (
            <button
              key={button.mode}
              type="button"
              className={`ui-btn ${mode === button.mode ? 'active' : ''}`}
              onClick={() => wallTool.setMode(button.mode)}
            >
              {button.label}
            </button>
          ))}
        </div>

        {/* Status Instruction */}
        <div className="ui-instruction">
          {isAddWall && wallTool.placementState === 'idle' && (
            <span>Click a grid cell to set wall start.</span>
          )}
          {isAddWall && wallTool.placementState === 'picking-end' && (
            <span className="ui-highlight-text">
              Click second cell to place wall (Esc to cancel).
            </span>
          )}
          {isAddWall && wallTool.wallPlacementError && (
            <span className="ui-error-text">{wallTool.wallPlacementError}</span>
          )}
          {isOpeningMode && !wallTool.openingPreviewMessage && (
            <span
              className={
                wallTool.openingPreviewValid ? 'ui-highlight-text' : undefined
              }
            >
              {wallTool.openingPreviewValid
                ? `Click to cut the ${openingLabel} into this wall.`
                : `Hover a wall to preview a ${openingLabel}.`}
            </span>
          )}
          {isOpeningMode && wallTool.openingPreviewMessage && (
            <span className="ui-error-text">
              {wallTool.openingPreviewMessage}
            </span>
          )}
          {isSelect && !selectedWall && !selectedOpening && (
            <span>
              Hover and click a wall, door or window to select and edit it.
            </span>
          )}
          {isSelect && selectedWall && (
            <span className="ui-highlight-text">Wall selected.</span>
          )}
          {isSelect && selectedOpening && (
            <span className="ui-highlight-text">
              {OPENING_LABELS[selectedOpening.type]} selected.
            </span>
          )}
        </div>

        {/* Inspectors */}
        {isSelect && selectedWall && (
          <WallInspector wallTool={wallTool} wall={selectedWall} />
        )}

        {isSelect && selectedOpening && (
          <OpeningInspector wallTool={wallTool} opening={selectedOpening} />
        )}
      </div>
    </div>
  );
};
