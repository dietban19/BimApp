import React, { useEffect, useReducer, useState } from 'react';
import type {
  ToolMode,
  WallToolComponent,
} from '../components/WallToolComponent';
import type { RoomComponent, RoomInfo } from '../components/RoomComponent';
import type { WallMesh } from '../objects/WallMesh';
import type { Opening } from '../objects/openings/Opening';
import { WindowMesh } from '../objects/openings/WindowMesh';
import { DoorMesh } from '../objects/openings/DoorMesh';
import { OPENING_LABELS, isGroundedOpeningType } from '../types/Opening';
import { CollapsibleSection } from './CollapsibleSection';
import { MaterialPicker } from './MaterialPicker';
import './UIOverlay.css';

interface UIOverlayProps {
  wallTool: WallToolComponent | null;
  roomTool: RoomComponent | null;
}

const MODE_BUTTONS: ReadonlyArray<{ mode: ToolMode; label: string }> = [
  { mode: 'select', label: 'Select' },
  { mode: 'add-wall', label: 'Wall' },
  { mode: 'add-door', label: 'Door' },
  { mode: 'add-window', label: 'Window' },
];

const OPENING_ICONS: Readonly<Record<string, string>> = {
  door: '🚪',
  window: '🪟',
};

interface RoomSurfaceInspectorProps {
  wallTool: WallToolComponent;
  surface: import('../objects/RoomMesh').RoomSurfaceMesh;
}

const RoomSurfaceInspector: React.FC<RoomSurfaceInspectorProps> = ({
  wallTool,
  surface,
}) => {
  const [materialsOpen, setMaterialsOpen] = useState(true);

  return (
    <div className="ui-inspector">
      <h3 className="ui-section-title">
        Selected {surface.surfaceType === 'floor' ? 'Floor' : 'Roof'}
      </h3>

      <CollapsibleSection
        title={`${surface.surfaceType === 'floor' ? 'Floor' : 'Roof'} Material`}
        isOpen={materialsOpen}
        onToggle={() => setMaterialsOpen(!materialsOpen)}
        icon="🎨"
      >
        <MaterialPicker
          title={
            surface.surfaceType === 'floor' ? 'Floor Finish' : 'Roof Finish'
          }
          currentMaterialId={surface.getCustomMaterialId() ?? 'concrete'}
          allowedCategories={['concrete', 'tiles', 'wood', 'metal']}
          onSelectMaterial={(material, materialId) => {
            wallTool.setSelectedRoomSurfaceMaterial(material, materialId);
          }}
          onPreviewMaterial={(material) => {
            wallTool.previewRoomSurfaceMaterial(material);
          }}
        />
      </CollapsibleSection>
    </div>
  );
};

function parsePositive(value: string): number | null {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegative(value: string): number | null {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

interface RoomPanelProps {
  roomTool: RoomComponent;
}

const RoomPanel: React.FC<RoomPanelProps> = ({ roomTool }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rooms = roomTool.rooms;

  return (
    <div className="ui-inspector">
      <CollapsibleSection
        title={`Rooms (${rooms.length})`}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        icon="🏠"
      >
        <div className="ui-mode-toggle" style={{ marginTop: '8px' }}>
          <button
            type="button"
            className={`ui-btn ${roomTool.showFloors ? 'active' : ''}`}
            onClick={() => roomTool.toggleFloors()}
          >
            🟦 Floors
          </button>
          <button
            type="button"
            className={`ui-btn ${roomTool.showRoofs ? 'active' : ''}`}
            onClick={() => roomTool.toggleRoofs()}
          >
            ⛰️ Roofs
          </button>
          <button
            type="button"
            className={`ui-btn ${roomTool.showLabels ? 'active' : ''}`}
            onClick={() => roomTool.toggleLabels()}
            style={{ gridColumn: '1 / -1' }}
          >
            🏷️ Labels
          </button>
        </div>

        {rooms.length === 0 ? (
          <div className="ui-instruction" style={{ marginTop: '8px' }}>
            No rooms yet. Close a region with walls and it is detected
            automatically.
          </div>
        ) : (
          <ul className="ui-list" style={{ marginTop: '8px' }}>
            {rooms.map((room) => (
              <li key={room.id} className="ui-list-item">
                <span>{room.name}</span>
                <span>
                  {room.area.toFixed(2)} m² · {room.walls.length} walls
                </span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
};

interface WallInspectorProps {
  wallTool: WallToolComponent;
  wall: WallMesh;
  rooms: RoomInfo[];
}

const WallInspector: React.FC<WallInspectorProps> = ({
  wallTool,
  wall,
  rooms,
}) => {
  const [dimensionsOpen, setDimensionsOpen] = useState(true);
  const [materialsOpen, setMaterialsOpen] = useState(true);
  const [openingsOpen, setOpeningsOpen] = useState(true);

  return (
    <div className="ui-inspector">
      <h3 className="ui-section-title">Selected Wall Details</h3>

      {/* Dimensions & Properties Section */}
      <CollapsibleSection
        title="Dimensions & Properties"
        isOpen={dimensionsOpen}
        onToggle={() => setDimensionsOpen(!dimensionsOpen)}
        icon="📐"
      >
        <button
          type="button"
          className={`ui-btn ${wallTool.resizeMode ? 'active' : ''}`}
          onClick={() => wallTool.toggleResizeMode()}
          style={{ width: '100%', marginBottom: '8px' }}
        >
          {wallTool.resizeMode ? '✋ Stop Resize' : '↔️ Resize Wall'}
        </button>

        {wallTool.resizeMode && (
          <div className="ui-instruction">
            Click an end node to open the gumball, click the gumball arrow to
            start resize, move the mouse, then click once to finish.
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
          <span>Bounds rooms:</span>
          <strong>
            {rooms.length === 0
              ? 'None'
              : rooms.map((room) => room.name).join(', ')}
          </strong>
        </div>

        <button
          type="button"
          className="ui-btn ui-btn-danger"
          onClick={() => wallTool.deleteSelectedWall()}
          style={{ width: '100%' }}
        >
          🗑️ Delete Wall
        </button>
      </CollapsibleSection>

      {/* Materials Section */}
      <CollapsibleSection
        title="Wall Materials"
        isOpen={materialsOpen}
        onToggle={() => setMaterialsOpen(!materialsOpen)}
        icon="🎨"
      >
        <MaterialPicker
          title="Wall Finish"
          currentMaterialId={wall.getCustomMaterialId() ?? 'wall-plaster'}
          allowedCategories={['wall', 'concrete', 'wood', 'tiles']}
          onSelectMaterial={(material, materialId) => {
            wallTool.setSelectedWallMaterial(material, materialId);
          }}
          onPreviewMaterial={(material) => {
            wallTool.previewWallMaterial(material);
          }}
        />
      </CollapsibleSection>

      {/* Openings Section */}
      {wall.openings.length > 0 && (
        <CollapsibleSection
          title={`Wall Openings (${wall.openings.length})`}
          isOpen={openingsOpen}
          onToggle={() => setOpeningsOpen(!openingsOpen)}
          icon="🚪"
          badge={wall.openings.length}
        >
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
        </CollapsibleSection>
      )}
    </div>
  );
};

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
  const isWindow = opening instanceof WindowMesh;
  const isDoor = opening instanceof DoorMesh;

  const [dimensionsOpen, setDimensionsOpen] = useState(true);
  const [glassMaterialOpen, setGlassMaterialOpen] = useState(true);
  const [leafMaterialOpen, setLeafMaterialOpen] = useState(true);
  const [frameMaterialOpen, setFrameMaterialOpen] = useState(false);

  return (
    <div className="ui-inspector">
      <h3 className="ui-section-title">Selected {label} Details</h3>

      {/* Dimensions & Placement Section */}
      <CollapsibleSection
        title="Dimensions & Placement"
        isOpen={dimensionsOpen}
        onToggle={() => setDimensionsOpen(!dimensionsOpen)}
        icon="📐"
      >
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
          style={{ width: '100%' }}
        >
          🗑️ Delete {label}
        </button>
      </CollapsibleSection>

      {/* Window Glass Material Section */}
      {isWindow && (
        <CollapsibleSection
          title="Glass Material"
          isOpen={glassMaterialOpen}
          onToggle={() => setGlassMaterialOpen(!glassMaterialOpen)}
          icon="🪟"
        >
          <MaterialPicker
            title="Physical Glass"
            currentMaterialId={(opening as WindowMesh).glassMaterialId}
            allowedCategories={['glass']}
            onSelectMaterial={(material, materialId) => {
              wallTool.setSelectedOpeningGlassMaterial(material, materialId);
            }}
            onPreviewMaterial={(material) => {
              wallTool.previewOpeningGlassMaterial(material);
            }}
          />
        </CollapsibleSection>
      )}

      {/* Door Leaf Material Section */}
      {isDoor && (
        <CollapsibleSection
          title="Door Leaf Material"
          isOpen={leafMaterialOpen}
          onToggle={() => setLeafMaterialOpen(!leafMaterialOpen)}
          icon="🚪"
        >
          <MaterialPicker
            title="Leaf Surface"
            currentMaterialId={(opening as DoorMesh).leafMaterialId}
            allowedCategories={['wood', 'metal']}
            onSelectMaterial={(material, materialId) => {
              wallTool.setSelectedOpeningLeafMaterial(material, materialId);
            }}
            onPreviewMaterial={(material) => {
              wallTool.previewOpeningLeafMaterial(material);
            }}
          />
        </CollapsibleSection>
      )}

      {/* Frame Material Section */}
      {(isWindow || isDoor) && (
        <CollapsibleSection
          title="Frame Material"
          isOpen={frameMaterialOpen}
          onToggle={() => setFrameMaterialOpen(!frameMaterialOpen)}
          icon="🖼️"
        >
          <MaterialPicker
            title="Frame Finish"
            currentMaterialId={
              isWindow
                ? (opening as WindowMesh).frameMaterialId
                : (opening as DoorMesh).frameMaterialId
            }
            allowedCategories={['wood', 'metal']}
            onSelectMaterial={(material, materialId) => {
              wallTool.setSelectedOpeningFrameMaterial(material, materialId);
            }}
          />
        </CollapsibleSection>
      )}
    </div>
  );
};

export const UIOverlay: React.FC<UIOverlayProps> = ({ wallTool, roomTool }) => {
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

  useEffect(() => {
    if (!roomTool) return;

    const unsubscribe = roomTool.subscribe(() => {
      forceUpdate();
    });

    return () => {
      unsubscribe();
    };
  }, [roomTool]);

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
  const selectedRoomSurface = wallTool.selectedRoomSurface;

  return (
    <div className="ui-overlay-container">
      <div className="ui-card">
        <div className="ui-header">
          <div>
            <p className="ui-kicker">Studio</p>
            <h2 className="ui-title">Room Editor</h2>
          </div>
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
          {isSelect &&
            !selectedWall &&
            !selectedOpening &&
            !selectedRoomSurface && (
              <span>
                Hover and click a wall, door, window, floor or roof to select
                and edit it.
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
          {isSelect && selectedRoomSurface && (
            <span className="ui-highlight-text">
              {selectedRoomSurface.surfaceType === 'floor' ? 'Floor' : 'Roof'}{' '}
              selected.
            </span>
          )}
        </div>

        {/* Detected rooms */}
        {roomTool && <RoomPanel roomTool={roomTool} />}

        {/* Inspectors */}
        {isSelect && selectedWall && (
          <WallInspector
            wallTool={wallTool}
            wall={selectedWall}
            rooms={roomTool?.getRoomsForWall(selectedWall) ?? []}
          />
        )}

        {isSelect && selectedOpening && (
          <OpeningInspector wallTool={wallTool} opening={selectedOpening} />
        )}

        {isSelect && selectedRoomSurface && (
          <RoomSurfaceInspector
            wallTool={wallTool}
            surface={selectedRoomSurface}
          />
        )}
      </div>
    </div>
  );
};
