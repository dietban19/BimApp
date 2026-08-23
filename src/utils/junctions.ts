import * as THREE from 'three';
import type { WallMesh } from '../objects/WallMesh';

export interface JunctionResult {
  start: THREE.Vector3;
  end: THREE.Vector3;
  orientation: 'x' | 'z';
}

/** How close a raw endpoint must be to a wall face to trigger snapping. */
const SNAP_EPSILON = 0.05;

export function calculateWallJunctions(
  rawStart: THREE.Vector3,
  rawEnd: THREE.Vector3,
  _newWallWidth: number,
  existingWalls: Iterable<WallMesh>,
): JunctionResult {
  const dx = Math.abs(rawEnd.x - rawStart.x);
  const dz = Math.abs(rawEnd.z - rawStart.z);
  const orientation: 'x' | 'z' = dx >= dz ? 'x' : 'z';

  const walls = [...existingWalls].filter((w) => !w.isPreview);

  if (orientation === 'x') {
    console.log('X');
    return snapXWall(rawStart, rawEnd, walls);
  } else {
    return snapZWall(rawStart, rawEnd, walls);
  }
}

/**
 * Snap an X-oriented wall (runs along X at a fixed Z) against any
 * perpendicular (Z-oriented) walls it touches or approaches.
 *
 * Rules:
 *  - If the raw start falls inside a Z wall's thickness, move it to that
 *    wall's near face so the new wall begins flush with the outside.
 *  - If the raw end reaches a Z wall, stop it at that wall's near face.
 *    When multiple Z walls are in the path, use the closest one.
 */
function snapXWall(
  rawStart: THREE.Vector3,
  rawEnd: THREE.Vector3,
  walls: WallMesh[],
): JunctionResult {
  let wallZ = rawStart.z;
  let startZ = rawStart.z;
  let endZ = rawEnd.z;
  let startX = rawStart.x;
  let endX = rawEnd.x;
  const dirX = Math.sign(endX - startX);
  if (dirX === 0) {
    return {
      start: new THREE.Vector3(startX, 0, wallZ),
      end: new THREE.Vector3(endX, 0, wallZ),
      orientation: 'x',
    };
  }

  // Only care about Z walls whose length spans this wall's Z coordinate.
  const perp = walls.filter((w) => {
    if (w.getOrientation() !== 'z') return false;
    const minZ = Math.min(w.startPoint.z, w.endPoint.z);
    const maxZ = Math.max(w.startPoint.z, w.endPoint.z);
    return wallZ >= minZ - SNAP_EPSILON && wallZ <= maxZ + SNAP_EPSILON;
  });
  console.log('perp', perp);
  // Pass 0 – snap wallZ to the front or back edge of any Z wall whose
  // endpoint the X wall is connecting to.  This determines whether the
  // X wall sits in front of or behind the Z wall in the Z direction.
  for (const w of perp) {
    const minZ = Math.min(w.startPoint.z, w.endPoint.z);
    const maxZ = Math.max(w.startPoint.z, w.endPoint.z);
    if (Math.abs(wallZ - minZ) <= SNAP_EPSILON) {
      wallZ = minZ;
      break;
    }
    if (Math.abs(wallZ - maxZ) <= SNAP_EPSILON) {
      wallZ = maxZ;
      break;
    }
  }

  // Pass 1 – snap start to the face of any Z wall it sits inside.
  for (const w of perp) {
    const centerX = (w.startPoint.x + w.endPoint.x) / 2;
    const halfW = w.width / 2;
    const leftFace = centerX - halfW;
    const rightFace = centerX + halfW;

    if (
      startX >= leftFace - SNAP_EPSILON &&
      startX <= rightFace + SNAP_EPSILON
    ) {
      startX = dirX > 0 ? rightFace : leftFace;
      break; // a wall can only start at one junction
    }
  }

  // Pass 2 – snap end to the closest Z wall face in the travel direction.
  for (const w of perp) {
    const centerX = (w.startPoint.x + w.endPoint.x) / 2;
    const halfW = w.width / 2;
    const leftFace = centerX - halfW;
    const rightFace = centerX + halfW;
    console.log('0000', startX, leftFace, rightFace);
    if (dirX > 0 && startX <= leftFace && endX >= leftFace - SNAP_EPSILON) {
      console.log('test 1');
      endX = Math.max(endX, rightFace);
    } else if (
      dirX > 0 &&
      startX >= leftFace &&
      endX <= leftFace + SNAP_EPSILON
    ) {
      console.log('TEST1');
    } else if (
      dirX < 0 &&
      startX <= leftFace &&
      endX >= leftFace - SNAP_EPSILON
    ) {
      console.log('test 2');
    } else if (
      dirX < 0 &&
      startX >= rightFace &&
      endX <= rightFace + SNAP_EPSILON
    ) {
      console.log('test 3');

      endX = Math.min(endX, leftFace);
    } else if (
      dirX > 0 &&
      startX >= rightFace &&
      endX <= rightFace + SNAP_EPSILON
    ) {
      console.log('test 4');

      endX = Math.min(endX, leftFace);
    }
    console.log(dirX, endZ, w.startPoint.z);
    if (dirX < 0 && Math.abs(endZ - w.startPoint.z) < 1) {
      console.log('1a');
      endZ = w.startPoint.z - w.width;
    } else if (dirX < 0 && Math.abs(endZ - w.endPoint.z) < 1) {
      console.log('2a');

      endZ = w.endPoint.z + w.width;
    } else if (dirX > 0 && Math.abs(endZ - w.startPoint.z) < 1) {
      if (Math.abs(startX - w.startPoint.x) < 1) {
        console.log('IT IS 3a');
        startX = w.startPoint.x - halfW;
      }
      console.log('3a');

      endZ = w.startPoint.z - w.width;
    } else if (dirX > 0 && Math.abs(endZ - w.endPoint.z) < 1) {
      console.log('4a');
      if (Math.abs(startX - w.startPoint.x) < 1) {
        console.log('IT IS 3a');
        startX = w.startPoint.x - halfW;
      }

      endZ = w.endPoint.z + w.width;
    } else if (dirX > 0 && Math.abs(startZ - w.startPoint) < 1) {
      console.log('5a');

      startZ = w.startPoint.z + w.width;
    }
  }

  return {
    start: new THREE.Vector3(startX, 0, startZ),
    end: new THREE.Vector3(endX, 0, endZ),
    orientation: 'x',
  };
}

/**
 * Snap a Z-oriented wall (runs along Z at a fixed X) against any
 * perpendicular (X-oriented) walls it touches or approaches.
 */
function snapZWall(
  rawStart: THREE.Vector3,
  rawEnd: THREE.Vector3,
  walls: WallMesh[],
): JunctionResult {
  let wallX = rawStart.x;
  let startX = rawStart.x;
  let endX = rawEnd.x;
  let startZ = rawStart.z;
  let endZ = rawEnd.z;
  const dirZ = Math.sign(endZ - startZ);

  if (dirZ === 0) {
    return {
      start: new THREE.Vector3(wallX, 0, startZ),
      end: new THREE.Vector3(wallX, 0, endZ),
      orientation: 'z',
    };
  }

  // Only care about X walls whose length spans this wall's X coordinate.
  const perp = walls.filter((w) => {
    if (w.getOrientation() !== 'x') return false;
    const minX = Math.min(w.startPoint.x, w.endPoint.x);
    const maxX = Math.max(w.startPoint.x, w.endPoint.x);
    return wallX >= minX - SNAP_EPSILON && wallX <= maxX + SNAP_EPSILON;
  });

  // Pass 0 – snap wallX to the left or right edge of any X wall whose
  // endpoint this Z wall is connecting to.
  for (const w of perp) {
    const minX = Math.min(w.startPoint.x, w.endPoint.x);
    const maxX = Math.max(w.startPoint.x, w.endPoint.x);
    if (Math.abs(wallX - minX) <= SNAP_EPSILON) {
      wallX = minX;
      break;
    }
    if (Math.abs(wallX - maxX) <= SNAP_EPSILON) {
      wallX = maxX;
      break;
    }
  }

  // Pass 1 – snap start to the face of any X wall it sits inside.
  for (const w of perp) {
    const centerZ = (w.startPoint.z + w.endPoint.z) / 2;
    const halfW = w.width / 2;
    const bottomFace = centerZ - halfW;
    const topFace = centerZ + halfW;

    if (
      startZ >= bottomFace - SNAP_EPSILON &&
      startZ <= topFace + SNAP_EPSILON
    ) {
      startZ = dirZ > 0 ? topFace : bottomFace;
      break;
    }
  }

  // Pass 2 – snap end to the closest X wall face in the travel direction.
  for (const w of perp) {
    const centerZ = (w.startPoint.z + w.endPoint.z) / 2;
    const halfW = w.width / 2;
    const bottomFace = centerZ - halfW;
    const topFace = centerZ + halfW;

    if (dirZ > 0 && startZ <= bottomFace && endZ >= bottomFace - SNAP_EPSILON) {
      endZ = Math.min(endZ, bottomFace);
    } else if (
      dirZ < 0 &&
      startZ >= topFace &&
      endZ <= topFace + SNAP_EPSILON
    ) {
      endZ = Math.max(endZ, topFace);
    }
    if (dirZ < 0 && Math.abs(endX - w.startPoint.x) < 1) {
      console.log('-----9');
      endX = w.startPoint.x + w.width;
    } else if (dirZ < 0 && Math.abs(endX - w.endPoint.x) < 1) {
      console.log('-----8');

      endX = w.endPoint.x - w.width;
    } else if (dirZ > 0 && Math.abs(endX - w.startPoint.x) < 1) {
      console.log('-----7');

      endX = w.startPoint.x + w.width;
    } else if (dirZ > 0 && Math.abs(endX - w.endPoint.x) < 1) {
      console.log('-----6');

      endX = w.endPoint.x - w.width;
    }
  }

  return {
    start: new THREE.Vector3(startX, 0, startZ),
    end: new THREE.Vector3(endX, 0, endZ),
    orientation: 'z',
  };
}
