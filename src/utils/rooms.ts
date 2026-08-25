import type { WallMesh } from '../objects/WallMesh';

export interface RoomRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  area: number;
}

const NODE_EPSILON = 0.18;
const OUTER_PADDING = 1;

function approxEqual(a: number, b: number, eps = NODE_EPSILON): boolean {
  return Math.abs(a - b) <= eps;
}

function spansInterval(
  a: number,
  b: number,
  min: number,
  max: number,
): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  return lo <= min + NODE_EPSILON && hi >= max - NODE_EPSILON;
}

function uniqSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];

  for (const value of sorted) {
    const last = result[result.length - 1];
    if (last === undefined || Math.abs(value - last) > NODE_EPSILON) {
      result.push(value);
    }
  }

  return result;
}

function getComponentKey(ix: number, iz: number): string {
  return `${ix}:${iz}`;
}

export function detectRectRooms(wallsIterable: Iterable<WallMesh>): RoomRect[] {
  const walls = [...wallsIterable].filter(
    (wall) => !wall.isPreview && wall.isRoomBoundary === true,
  );

  if (walls.length < 4) {
    return [];
  }

  const xsRaw = walls.flatMap((wall) => [wall.startPoint.x, wall.endPoint.x]);
  const zsRaw = walls.flatMap((wall) => [wall.startPoint.z, wall.endPoint.z]);

  const minX = Math.min(...xsRaw);
  const maxX = Math.max(...xsRaw);
  const minZ = Math.min(...zsRaw);
  const maxZ = Math.max(...zsRaw);

  const xs = uniqSorted([minX - OUTER_PADDING, ...xsRaw, maxX + OUTER_PADDING]);
  const zs = uniqSorted([minZ - OUTER_PADDING, ...zsRaw, maxZ + OUTER_PADDING]);

  if (xs.length < 3 || zs.length < 3) {
    return [];
  }

  const cellCountX = xs.length - 1;
  const cellCountZ = zs.length - 1;

  const blockedRight = new Set<string>();
  const blockedUp = new Set<string>();

  for (let ix = 0; ix < cellCountX - 1; ix += 1) {
    const boundaryX = xs[ix + 1];
    for (let iz = 0; iz < cellCountZ; iz += 1) {
      const segMinZ = zs[iz];
      const segMaxZ = zs[iz + 1];

      const blocked = walls.some((wall) => {
        if (wall.getOrientation() !== 'z') return false;
        if (!approxEqual(wall.startPoint.x, boundaryX)) return false;
        return spansInterval(
          wall.startPoint.z,
          wall.endPoint.z,
          segMinZ,
          segMaxZ,
        );
      });

      if (blocked) {
        blockedRight.add(getComponentKey(ix, iz));
      }
    }
  }

  for (let ix = 0; ix < cellCountX; ix += 1) {
    const segMinX = xs[ix];
    const segMaxX = xs[ix + 1];
    for (let iz = 0; iz < cellCountZ - 1; iz += 1) {
      const boundaryZ = zs[iz + 1];

      const blocked = walls.some((wall) => {
        if (wall.getOrientation() !== 'x') return false;
        if (!approxEqual(wall.startPoint.z, boundaryZ)) return false;
        return spansInterval(
          wall.startPoint.x,
          wall.endPoint.x,
          segMinX,
          segMaxX,
        );
      });

      if (blocked) {
        blockedUp.add(getComponentKey(ix, iz));
      }
    }
  }

  const visited = new Set<string>();
  const rooms: RoomRect[] = [];

  for (let startX = 0; startX < cellCountX; startX += 1) {
    for (let startZ = 0; startZ < cellCountZ; startZ += 1) {
      const startKey = getComponentKey(startX, startZ);
      if (visited.has(startKey)) continue;

      const queue: Array<{ ix: number; iz: number }> = [
        { ix: startX, iz: startZ },
      ];
      visited.add(startKey);

      let touchesBoundary = false;
      let regionMinX = Number.POSITIVE_INFINITY;
      let regionMaxX = Number.NEGATIVE_INFINITY;
      let regionMinZ = Number.POSITIVE_INFINITY;
      let regionMaxZ = Number.NEGATIVE_INFINITY;
      let area = 0;

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;

        const { ix, iz } = current;

        if (
          ix === 0 ||
          iz === 0 ||
          ix === cellCountX - 1 ||
          iz === cellCountZ - 1
        ) {
          touchesBoundary = true;
        }

        const cMinX = xs[ix];
        const cMaxX = xs[ix + 1];
        const cMinZ = zs[iz];
        const cMaxZ = zs[iz + 1];

        regionMinX = Math.min(regionMinX, cMinX);
        regionMaxX = Math.max(regionMaxX, cMaxX);
        regionMinZ = Math.min(regionMinZ, cMinZ);
        regionMaxZ = Math.max(regionMaxZ, cMaxZ);
        area += (cMaxX - cMinX) * (cMaxZ - cMinZ);

        const rightKey = getComponentKey(ix, iz);
        if (ix + 1 < cellCountX && !blockedRight.has(rightKey)) {
          const nextKey = getComponentKey(ix + 1, iz);
          if (!visited.has(nextKey)) {
            visited.add(nextKey);
            queue.push({ ix: ix + 1, iz });
          }
        }

        if (ix - 1 >= 0) {
          const leftBarrierKey = getComponentKey(ix - 1, iz);
          if (!blockedRight.has(leftBarrierKey)) {
            const nextKey = getComponentKey(ix - 1, iz);
            if (!visited.has(nextKey)) {
              visited.add(nextKey);
              queue.push({ ix: ix - 1, iz });
            }
          }
        }

        const upKey = getComponentKey(ix, iz);
        if (iz + 1 < cellCountZ && !blockedUp.has(upKey)) {
          const nextKey = getComponentKey(ix, iz + 1);
          if (!visited.has(nextKey)) {
            visited.add(nextKey);
            queue.push({ ix, iz: iz + 1 });
          }
        }

        if (iz - 1 >= 0) {
          const downBarrierKey = getComponentKey(ix, iz - 1);
          if (!blockedUp.has(downBarrierKey)) {
            const nextKey = getComponentKey(ix, iz - 1);
            if (!visited.has(nextKey)) {
              visited.add(nextKey);
              queue.push({ ix, iz: iz - 1 });
            }
          }
        }
      }

      if (touchesBoundary || area <= NODE_EPSILON) {
        continue;
      }

      rooms.push({
        minX: regionMinX,
        maxX: regionMaxX,
        minZ: regionMinZ,
        maxZ: regionMaxZ,
        centerX: (regionMinX + regionMaxX) / 2,
        centerZ: (regionMinZ + regionMaxZ) / 2,
        area,
      });
    }
  }

  rooms.sort((a, b) => {
    if (!approxEqual(a.centerZ, b.centerZ)) {
      return a.centerZ - b.centerZ;
    }
    return a.centerX - b.centerX;
  });

  return rooms;
}
