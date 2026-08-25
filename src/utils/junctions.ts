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
    return snapXWall(rawStart, rawEnd, _newWallWidth, walls);
  } else {
    return snapZWall(rawStart, rawEnd, _newWallWidth, walls);
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
  _newWallWidth: number,
  walls: WallMesh[],
): JunctionResult {
  let wallZ = rawStart.z;
  let wallX = rawStart.x;

  let startZ = rawStart.z;
  let endZ = rawEnd.z;
  let startX = rawStart.x;
  let endX = rawEnd.x;
  const halfW = _newWallWidth / 2;
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
  const perpX = walls.filter((w) => {
    if (w.getOrientation() !== 'x') return false;
    const minZ = Math.min(w.startPoint.z, w.endPoint.z);
    const maxZ = Math.max(w.startPoint.z, w.endPoint.z);

    console.log(minZ, maxZ);

    return (
      wallZ >= minZ - SNAP_EPSILON - w.width &&
      wallZ <= maxZ + SNAP_EPSILON + w.width
    );
  });
  console.log('perp', perp, perpX);

  // Pass 0 – snap wallZ to the front or back edge of any Z wall whose
  // endpoint the X wall is connecting to.  This determines whether the
  // X wall sits in front of or behind the Z wall in the Z direction.
  for (const w of perp) {
    const minZ = Math.min(w.startPoint.z, w.endPoint.z);
    const maxZ = Math.max(w.startPoint.z, w.endPoint.z);
    // X Wall should be in -z of z wall
    if (Math.abs(wallZ - minZ) <= SNAP_EPSILON) {
      wallZ = minZ - halfW;
      break;
    }
    if (Math.abs(wallZ - maxZ) <= SNAP_EPSILON) {
      wallZ = maxZ + halfW;
      break;
    }
  }
  for (const w of perp) {
    const centerX = (w.startPoint.x + w.endPoint.x) / 2;
    const halfW = w.width / 2;
    const leftFace = centerX - halfW;
    const rightFace = centerX + halfW;

    if (
      startX >= leftFace - SNAP_EPSILON &&
      startX <= rightFace + SNAP_EPSILON
    ) {
      // startX = dirX > 0 ? rightFace : leftFace;
      if (dirX > 0) {
        startX = leftFace;
      } else if (dirX < 0) {
        startX = rightFace;
      }
    }
  }
  for (const w of perp) {
    const centerX = (w.startPoint.x + w.endPoint.x) / 2;
    const halfW = w.width / 2;
    const leftFace = centerX - halfW;
    const rightFace = centerX + halfW;

    if (endX >= leftFace - SNAP_EPSILON && endX <= rightFace + SNAP_EPSILON) {
      if (dirX > 0) {
        endX = rightFace;
      } else {
        endX = leftFace;
      }
    }
  }
  for (const w of perpX) {
    const minX = Math.min(w.startPoint.x, w.endPoint.x);
    const maxX = Math.max(w.startPoint.x, w.endPoint.x);
    const existingDirX = Math.sign(w.endPoint.x - w.startPoint.x);
    if (startX >= minX - SNAP_EPSILON && startX <= maxX + SNAP_EPSILON) {
      if (dirX > 0 && existingDirX > 0) {
        console.log('One');
        startX = w.endPoint.x;
      } else if (dirX > 0 && existingDirX < 0) {
        console.log('TWO');

        startX = w.startPoint.x;
      } else if (dirX < 0 && existingDirX > 0) {
        console.log('THREE');

        startX = w.startPoint.x;
      } else if (dirX < 0 && existingDirX < 0) {
        console.log('FOUR');

        startX = w.endPoint.x;
      }
    }
  }

  for (const w of perpX) {
    const minX = Math.min(w.startPoint.x, w.endPoint.x);
    const maxX = Math.max(w.startPoint.x, w.endPoint.x);
    const existingDirX = Math.sign(w.endPoint.x - w.startPoint.x);
    if (endX >= minX - SNAP_EPSILON && endX <= maxX + SNAP_EPSILON) {
      if (dirX > 0 && existingDirX > 0) {
        endX = w.startPoint.x;
        console.log('---One');
      } else if (dirX > 0 && existingDirX < 0) {
        endX = w.endPoint.x;
        console.log('---TWO');
      } else if (dirX < 0 && existingDirX > 0) {
        endX = w.endPoint.x;
        console.log('---THREE');
      } else if (dirX < 0 && existingDirX < 0) {
        endX = w.startPoint.x;
        console.log('----FOUR');
      }
    }
  }

  // for (const w of perpX) {
  //   const minX = Math.min(w.startPoint.x, w.endPoint.x);
  //   const maxX = Math.max(w.startPoint.x, w.endPoint.x);
  //   const existingDirX = Math.sign(w.endPoint.x - w.startPoint.x);
  //   if (endX >= minX - SNAP_EPSILON && endX <= maxX + SNAP_EPSILON) {
  //     if (dirX > 0) {
  //       endX = maxX;
  //     } else {
  //       endX = minX;
  //     }
  //   }
  // }
  // // Pass 2 – snap end to the closest Z wall face in the travel direction.
  // for (const w of perp) {
  //   const centerX = (w.startPoint.x + w.endPoint.x) / 2;
  //   const halfW = w.width / 2;
  //   const leftFace = centerX - halfW;
  //   const rightFace = centerX + halfW;
  //   console.log('0000', startX, leftFace, rightFace);
  //   if (dirX > 0) {
  //     if (startX <= leftFace && endX >= leftFace - SNAP_EPSILON) {
  //       console.log('test 1');
  //       endX = Math.max(endX, rightFace);
  //     } else if (startX >= leftFace && endX <= leftFace + SNAP_EPSILON) {
  //       console.log('TEST1');
  //     } else if (startX <= rightFace && endX >= rightFace - SNAP_EPSILON) {
  //       console.log('test 2');
  //     } else if (startX >= rightFace && endX <= rightFace + SNAP_EPSILON) {
  //       console.log('test 3');
  //       endX = Math.min(endX, leftFace);
  //     }
  //   } else if (dirX < 0) {
  //     if (startX <= leftFace && endX >= leftFace - SNAP_EPSILON) {
  //       console.log('test 4');
  //       endX = Math.min(endX, leftFace);
  //     } else if (startX >= leftFace && endX <= leftFace + SNAP_EPSILON) {
  //       console.log('test 5', startX, leftFace, endX);
  //       startX = leftFace + w.width;
  //     } else if (startX <= rightFace && endX >= rightFace - SNAP_EPSILON) {
  //       console.log('test 6');
  //     } else if (startX >= rightFace && endX <= rightFace + SNAP_EPSILON) {
  //       console.log('test 7');
  //       endX = Math.max(endX, rightFace);
  //     }

  //     if (Math.abs(startZ - w.startPoint.z) < 1) {
  //       console.log('1a');
  //       startZ = w.startPoint.z - w.width;
  //     } else if (Math.abs(endZ - w.startPoint.z) < 1) {
  //       console.log('2AA');

  //       endZ = w.startPoint.z - w.width;
  //     } else if (Math.abs(endZ - w.endPoint.z) < 1) {
  //       console.log('2AAA');

  //       endZ = w.endPoint.z + w.width;
  //     }
  //   }
  //   if (dirX > 0 && Math.abs(endZ - w.startPoint.z) < 1) {
  //     if (Math.abs(startX - w.startPoint.x) < 1) {
  //       console.log('IT IS 3a');
  //       startX = w.startPoint.x - halfW;
  //     }
  //     console.log('3a');

  //     endZ = w.startPoint.z - w.width;
  //   } else if (dirX > 0 && Math.abs(endZ - w.endPoint.z) < 1) {
  //     console.log('4a');
  //     if (Math.abs(startX - w.startPoint.x) < 1) {
  //       console.log('IT IS 3a');
  //       startX = w.startPoint.x - halfW;
  //     }

  //     endZ = w.endPoint.z + w.width;
  //   } else if (dirX > 0 && Math.abs(startZ - w.startPoint.z) < 1) {
  //     console.log('5a');

  //     startZ = w.startPoint.z + w.width;
  //   }
  // }

  return {
    start: new THREE.Vector3(startX, 0, wallZ),
    end: new THREE.Vector3(endX, 0, wallZ),
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
  _newWallWidth: number,
  walls: WallMesh[],
): JunctionResult {
  let wallX = rawStart.x;
  const startX = rawStart.x;
  let endX = rawEnd.x;
  let startZ = rawStart.z;
  let endZ = rawEnd.z;
  const dirZ = Math.sign(endZ - startZ);
  const halfW = _newWallWidth / 2;

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

  console.log('z perp', perp);
  // Pass 0 – snap wallX to the left or right edge of any X wall whose
  // endpoint this Z wall is connecting to.
  for (const w of perp) {
    const minX = Math.min(w.startPoint.x, w.endPoint.x);
    const maxX = Math.max(w.startPoint.x, w.endPoint.x);

    //
    if (Math.abs(wallX - minX) <= SNAP_EPSILON) {
      wallX = minX + halfW;
      break;
    }
    if (Math.abs(wallX - maxX) <= SNAP_EPSILON) {
      wallX = maxX - halfW;
      break;
    }
  }
  for (const w of perp) {
    const centerZ = (w.startPoint.z + w.endPoint.z) / 2;
    const halfW = w.width / 2;
    const bottomFace = centerZ - halfW;
    const topFace = centerZ + halfW;
    console.log(bottomFace, topFace);
    console.log('startZ', startZ, 'dirZ', dirZ);
    if (
      startZ >= bottomFace - SNAP_EPSILON &&
      startZ <= topFace + SNAP_EPSILON
    ) {
      console.log('is dirZ', dirZ > 0);
      if (dirZ > 0) {
        startZ = topFace;
        console.log('top startZ', startZ);
      } else if (dirZ < 0) {
        startZ = bottomFace;
        console.log('bottom startZ', startZ);
      }
    }
  }
  for (const w of perp) {
    const centerZ = (w.startPoint.z + w.endPoint.z) / 2;
    const halfW = w.width / 2;
    const bottomFace = centerZ - halfW;
    const topFace = centerZ + halfW;
    console.log(bottomFace, topFace);
    console.log('startZ', startZ, 'dirZ', dirZ);
    if (endZ >= bottomFace - SNAP_EPSILON && endZ <= topFace + SNAP_EPSILON) {
      console.log('is dirZ', dirZ > 0);
      if (dirZ > 0) {
        endZ = bottomFace;
        console.log('top endZ', endZ);
      } else if (dirZ < 0) {
        endZ = topFace;
        console.log('bottom startZ', startZ);
      }
    }
  }

  // // Pass 1 – snap start to the face of any X wall it sits inside.
  // for (const w of perp) {
  //   const centerZ = (w.startPoint.z + w.endPoint.z) / 2;
  //   const halfW = w.width / 2;
  //   const bottomFace = centerZ - halfW;
  //   const topFace = centerZ + halfW;

  //   if (
  //     startZ >= bottomFace - SNAP_EPSILON &&
  //     startZ <= topFace + SNAP_EPSILON
  //   ) {
  //     startZ = dirZ > 0 ? topFace : bottomFace;
  //     break;
  //   }
  // }

  // Pass 2 – snap end to the closest X wall face in the travel direction.

  return {
    start: new THREE.Vector3(wallX, 0, startZ),
    end: new THREE.Vector3(wallX, 0, endZ),
    orientation: 'z',
  };
}
