import { DoorMesh } from './DoorMesh';
import { WindowMesh } from './WindowMesh';
import type { Opening } from './Opening';
import {
  OPENING_DEFAULTS,
  type OpeningParams,
  type OpeningType,
} from '../../types/Opening';

type OpeningConstructor = new (
  params: OpeningParams,
  isPreview?: boolean,
) => Opening;

/**
 * Registry of the opening kinds the application knows about.
 *
 * Adding a new kind (a hatch, a pass-through, ...) only requires a new
 * `Opening` subclass plus an entry here.
 */
const OPENING_CONSTRUCTORS: Readonly<Record<OpeningType, OpeningConstructor>> = {
  door: DoorMesh,
  window: WindowMesh,
};

export function createOpening(
  type: OpeningType,
  params: OpeningParams,
  isPreview = false,
): Opening {
  return new OPENING_CONSTRUCTORS[type](params, isPreview);
}

/**
 * Builds the parameters for a freshly placed opening of the given kind.
 */
export function createDefaultOpeningParams(
  type: OpeningType,
  distanceAlongWall: number,
): OpeningParams {
  return { ...OPENING_DEFAULTS[type], distanceAlongWall };
}
