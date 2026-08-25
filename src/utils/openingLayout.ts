import type { OpeningParams } from '../types/Opening';
import type { RectCutout } from './profileGeometry';

/**
 * Minimum amount of solid wall that must remain between an opening and the
 * wall edges (or another opening).
 *
 * Besides being sensible from a modelling point of view, this also guarantees
 * the extruded wall profile never degenerates into a zero-width sliver or a
 * hole that touches the outline, which triangulation cannot handle.
 */
export const MIN_SOLID_MARGIN = 0.01;

export type OpeningValidation =
  | { valid: true }
  | { valid: false; reason: string };

const VALID: OpeningValidation = { valid: true };

function invalid(reason: string): OpeningValidation {
  return { valid: false, reason };
}

/**
 * Converts an opening description into its 2D footprint on the wall profile.
 */
export function getOpeningFootprint(params: OpeningParams): RectCutout {
  return {
    start: params.distanceAlongWall - params.width / 2,
    end: params.distanceAlongWall + params.width / 2,
    bottom: params.sillHeight,
    top: params.sillHeight + params.height,
  };
}

/**
 * Two footprints clash when they overlap both horizontally and vertically.
 *
 * This allows a window to sit above a door, but rejects anything that would
 * merge two openings into one.
 */
export function footprintsOverlap(
  a: RectCutout,
  b: RectCutout,
  margin = MIN_SOLID_MARGIN,
): boolean {
  const horizontal = a.start < b.end + margin && b.start < a.end + margin;
  const vertical = a.bottom < b.top + margin && b.bottom < a.top + margin;

  return horizontal && vertical;
}

/**
 * Validates a candidate opening against the wall it should be cut into.
 *
 * `existing` holds the footprints of the openings already placed on that wall
 * (excluding the one being edited, if any).
 */
export function validateOpeningPlacement(
  params: OpeningParams,
  wallLength: number,
  wallHeight: number,
  existing: readonly RectCutout[] = [],
): OpeningValidation {
  if (!Number.isFinite(params.width) || params.width <= 0) {
    return invalid('Opening width must be greater than zero.');
  }

  if (!Number.isFinite(params.height) || params.height <= 0) {
    return invalid('Opening height must be greater than zero.');
  }

  if (!Number.isFinite(params.sillHeight) || params.sillHeight < 0) {
    return invalid('Opening cannot start below floor level.');
  }

  if (!Number.isFinite(params.distanceAlongWall)) {
    return invalid('Opening position is not a valid number.');
  }

  const footprint = getOpeningFootprint(params);

  if (
    footprint.start < MIN_SOLID_MARGIN ||
    footprint.end > wallLength - MIN_SOLID_MARGIN
  ) {
    return invalid('Opening does not fit between the wall ends.');
  }

  if (footprint.top > wallHeight - MIN_SOLID_MARGIN) {
    return invalid('Opening is too tall for this wall.');
  }

  for (const other of existing) {
    if (footprintsOverlap(footprint, other)) {
      return invalid('Opening overlaps another opening.');
    }
  }

  return VALID;
}
