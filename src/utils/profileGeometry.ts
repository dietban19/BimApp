import * as THREE from 'three';

/**
 * A rectangular cut-out described in the 2D profile space of a wall panel.
 *
 * `start`/`end` run along the panel width (0 .. width) and `bottom`/`top`
 * run along the panel height (0 .. height).
 */
export interface RectCutout {
  start: number;
  end: number;
  bottom: number;
  top: number;
}

/** A cut-out whose bottom is at (or below) floor level is treated as a notch. */
const GROUND_EPSILON = 1e-4;

/**
 * Builds the 2D cross section of a panel (a wall, a door frame, ...) that has
 * rectangular cut-outs.
 *
 * Cut-outs that sit on the floor (doors) cannot be modelled as holes because a
 * hole must be fully enclosed by the outline. They are instead traced into the
 * bottom edge of the outline as notches. Cut-outs that float above the floor
 * (windows) become real holes.
 *
 * The resulting shape is centred horizontally (x from -width/2 to +width/2) and
 * starts at y = 0 so that y maps directly to "height above floor".
 */
export function createProfileShape(
  width: number,
  height: number,
  cutouts: readonly RectCutout[] = [],
): THREE.Shape {
  const halfWidth = width / 2;

  const notches = cutouts
    .filter((cutout) => cutout.bottom <= GROUND_EPSILON)
    .sort((a, b) => a.start - b.start);

  const holes = cutouts.filter((cutout) => cutout.bottom > GROUND_EPSILON);

  const shape = new THREE.Shape();

  // Bottom edge, stepping up and over every floor level cut-out.
  shape.moveTo(-halfWidth, 0);

  for (const notch of notches) {
    shape.lineTo(notch.start - halfWidth, 0);
    shape.lineTo(notch.start - halfWidth, notch.top);
    shape.lineTo(notch.end - halfWidth, notch.top);
    shape.lineTo(notch.end - halfWidth, 0);
  }

  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth, height);
  shape.lineTo(-halfWidth, height);
  shape.closePath();

  // Holes are wound clockwise, opposite to the counter-clockwise outline.
  for (const cutout of holes) {
    const hole = new THREE.Path();
    hole.moveTo(cutout.start - halfWidth, cutout.bottom);
    hole.lineTo(cutout.start - halfWidth, cutout.top);
    hole.lineTo(cutout.end - halfWidth, cutout.top);
    hole.lineTo(cutout.end - halfWidth, cutout.bottom);
    hole.closePath();
    shape.holes.push(hole);
  }

  return shape;
}

/**
 * Extrudes {@link createProfileShape} through the full panel depth.
 *
 * The geometry is centred on the depth axis, so the mesh can simply be placed
 * at the wall's centre line. Because the profile is extruded through the whole
 * depth, every cut-out is a real hole through the panel, including the reveal
 * faces around it.
 */
export function createProfileGeometry(
  width: number,
  height: number,
  depth: number,
  cutouts: readonly RectCutout[] = [],
): THREE.BufferGeometry {
  const shape = createProfileShape(width, height, cutouts);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });

  geometry.translate(0, 0, -depth / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export interface FrameOptions {
  outerWidth: number;
  outerHeight: number;
  depth: number;
  /** Width of the frame members. */
  thickness: number;
  /** Omit the bottom member (used for door jambs). */
  openBottom?: boolean;
}

/**
 * Builds a rectangular frame ("picture frame") geometry.
 *
 * The returned geometry is centred on all three axes so it can be dropped
 * straight into the middle of an opening.
 */
export function createFrameGeometry(options: FrameOptions): THREE.BufferGeometry {
  const { outerWidth, outerHeight, depth, thickness, openBottom = false } = options;

  const maxThickness = Math.min(outerWidth, outerHeight) / 2 - 1e-3;
  const safeThickness = Math.max(Math.min(thickness, maxThickness), 1e-3);

  const cutout: RectCutout = {
    start: safeThickness,
    end: outerWidth - safeThickness,
    bottom: openBottom ? 0 : safeThickness,
    top: outerHeight - safeThickness,
  };

  const geometry = createProfileGeometry(outerWidth, outerHeight, depth, [cutout]);
  geometry.translate(0, -outerHeight / 2, 0);

  return geometry;
}
