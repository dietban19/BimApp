/**
 * Shared, renderer agnostic description of a wall opening.
 *
 * Openings are always described in the local frame of the wall they belong to:
 *
 *  - `distanceAlongWall` is measured from the wall's "min" end
 *    (smallest X for X-oriented walls, smallest Z for Z-oriented walls)
 *    to the horizontal centre of the opening.
 *  - `sillHeight` is measured from floor level (y = 0).
 *
 * Keeping the description independent from Three.js makes the placement rules
 * easy to unit test and reuse for other opening kinds later on.
 */
export type OpeningType = 'door' | 'window';

export interface OpeningParams {
  /** Distance from the wall's min end to the centre of the opening (m). */
  distanceAlongWall: number;

  /** Clear width of the opening (m). */
  width: number;

  /** Clear height of the opening (m). */
  height: number;

  /** Height of the opening's bottom edge above floor level (m). */
  sillHeight: number;
}

export type OpeningSize = Omit<OpeningParams, 'distanceAlongWall'>;

/**
 * Default sizes used when a new opening is placed.
 */
export const OPENING_DEFAULTS: Readonly<Record<OpeningType, OpeningSize>> = {
  door: { width: 0.9, height: 2.1, sillHeight: 0 },
  window: { width: 1.2, height: 1.0, sillHeight: 1.0 },
};

export const OPENING_LABELS: Readonly<Record<OpeningType, string>> = {
  door: 'Door',
  window: 'Window',
};

/**
 * A door always sits on the floor, so its sill height is not user editable.
 */
export function isGroundedOpeningType(type: OpeningType): boolean {
  return type === 'door';
}
