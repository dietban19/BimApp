import React, { useEffect, useReducer } from 'react';
import type { WallToolComponent } from '../components/WallToolComponent';
import './UIOverlay.css';

interface UIOverlayProps {
  wallTool: WallToolComponent | null;
}

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

  const isAddWall = wallTool.mode === 'add-wall';
  const isSelect = wallTool.mode === 'select';
  const selectedWall = wallTool.selectedWall;

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      wallTool.setSelectedWallHeight(val);
    }
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      wallTool.setSelectedWallWidth(val);
    }
  };

  return (
    <div className="ui-overlay-container">
      <div className="ui-card">
        <div className="ui-header">
          <h2 className="ui-title">Modeling Tools</h2>
        </div>

        {/* Mode Selector Toggle */}
        <div className="ui-mode-toggle">
          <button
            type="button"
            className={`ui-btn ${isSelect ? 'active' : ''}`}
            onClick={() => wallTool.setMode('select')}
          >
            🔍 Select
          </button>
          <button
            type="button"
            className={`ui-btn ${isAddWall ? 'active' : ''}`}
            onClick={() => wallTool.setMode('add-wall')}
          >
            🧱 Add Wall
          </button>
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
          {isSelect && !selectedWall && (
            <span>Hover and click a wall to select and edit its properties.</span>
          )}
          {isSelect && selectedWall && (
            <span className="ui-highlight-text">Wall selected.</span>
          )}
        </div>

        {/* Selected Wall Inspector */}
        {isSelect && selectedWall && (
          <div className="ui-inspector">
            <h3 className="ui-section-title">Selected Wall Details</h3>

            <div className="ui-field">
              <label htmlFor="wall-height">Height (m):</label>
              <input
                id="wall-height"
                type="number"
                step="0.1"
                min="0.1"
                max="20"
                value={selectedWall.height}
                onChange={handleHeightChange}
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
                value={selectedWall.width}
                onChange={handleWidthChange}
              />
            </div>

            <div className="ui-field-readonly">
              <span>Length:</span>
              <strong>{selectedWall.getLength().toFixed(2)} m</strong>
            </div>

            <div className="ui-field-readonly">
              <span>Orientation:</span>
              <strong>{selectedWall.getOrientation().toUpperCase()}-axis</strong>
            </div>

            <button
              type="button"
              className="ui-btn ui-btn-danger"
              onClick={() => wallTool.deleteSelectedWall()}
            >
              🗑️ Delete Wall
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
