import type {
  DetectedRoom,
  RoomBounds,
  RoomPoint,
  RoomWallLike,
} from '../types/Room';

/**
 * Room detection.
 *
 * The walls are turned into a planar graph of their centre lines and every
 * minimal cycle (face) of that graph becomes a room:
 *
 *   1. Each wall becomes an axis aligned segment.
 *   2. Segments that meet - either end to end, or as a T where one wall runs
 *      into the side of another - get a shared node. Because the placement
 *      tools snap walls to each other's faces, centre lines usually stop half
 *      a wall thickness short of each other, so "meeting" is measured with a
 *      tolerance derived from the wall thickness.
 *   3. Every wall is split at the nodes that lie on it, which is what lets a
 *      single wall act as a boundary for the rooms on both of its sides.
 *   4. Dangling chains (walls that do not close anything) are pruned.
 *   5. The remaining graph is traversed face by face. Traversing the "next
 *      edge clockwise" at every node yields the minimal faces only, so an
 *      outer boundary that contains several smaller spaces never shows up as
 *      a room of its own - only the actual spaces do.
 *
 * Doors and windows are deliberately ignored: they are cut into a wall but
 * never divide it, so a wall with openings keeps bounding its rooms.
 */

/** Extra slack (m) on top of half a wall thickness when joining centre lines. */
const JOIN_EPS = 0.05;

/** Walls shorter than this (m) cannot contribute a meaningful boundary. */
const MIN_SEGMENT_LENGTH = 0.02;

/** Faces smaller than this (m²) are numerical noise rather than rooms. */
const MIN_ROOM_AREA = 0.02;

/** Two directions are treated as parallel below this cross product. */
const PARALLEL_EPS = 1e-6;

/** Room ids are built from millimetre precision coordinates. */
const SIGNATURE_PRECISION = 1000;

type Orientation = 'x' | 'z';

interface Segment<TWall extends RoomWallLike> {
  wall: TWall;
  orientation: Orientation;
  /** Fixed coordinate: z for x-oriented walls, x for z-oriented walls. */
  axisPos: number;
  min: number;
  max: number;
  width: number;
}

/** A point that wants to become (or join) a graph node. */
interface Candidate {
  segment: number;
  /** Coordinate along the owning segment's axis. */
  t: number;
  x: number;
  z: number;
  /** How far away another candidate may sit and still be the same node. */
  radius: number;
}

interface GraphEdge<TWall extends RoomWallLike> {
  a: number;
  b: number;
  wall: TWall;
  width: number;
}

interface Dart {
  from: number;
  to: number;
  edge: number;
}

// --------------------------------
// Polygon helpers
// --------------------------------

/**
 * Shoelace area of a loop in the XZ plane.
 *
 * Positive means the loop is wound the same way as the interior faces
 * produced by the traversal below.
 */
export function signedArea(points: readonly RoomPoint[]): number {
  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }

  return sum / 2;
}

function polygonPerimeter(points: readonly RoomPoint[]): number {
  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += Math.hypot(b.x - a.x, b.z - a.z);
  }

  return sum;
}

function polygonBounds(points: readonly RoomPoint[]): RoomBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  return { minX, maxX, minZ, maxZ };
}

function polygonCenter(points: readonly RoomPoint[]): RoomPoint {
  const area = signedArea(points);
  const bounds = polygonBounds(points);

  if (Math.abs(area) < 1e-9) {
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    };
  }

  let cx = 0;
  let cz = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.z - b.x * a.z;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }

  return { x: cx / (6 * area), z: cz / (6 * area) };
}

/**
 * Moves every edge of a counter clockwise loop inwards by half of the
 * thickness of the wall that carries it, so the floor stops at the inner wall
 * faces instead of the centre lines.
 *
 * Returns null when the result would be degenerate (a room smaller than the
 * walls around it), in which case the caller falls back to the centre lines.
 */
function insetPolygon(
  points: readonly RoomPoint[],
  widths: readonly number[],
): RoomPoint[] | null {
  const count = points.length;

  if (count < 3) {
    return null;
  }

  const lines: { px: number; pz: number; dx: number; dz: number }[] = [];

  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];

    const rawX = b.x - a.x;
    const rawZ = b.z - a.z;
    const length = Math.hypot(rawX, rawZ);

    if (length < 1e-9) {
      return null;
    }

    const dx = rawX / length;
    const dz = rawZ / length;
    const offset = widths[i] / 2;

    // For a counter clockwise loop the interior is on the left of each edge.
    lines.push({
      px: a.x - dz * offset,
      pz: a.z + dx * offset,
      dx,
      dz,
    });
  }

  const result: RoomPoint[] = [];

  for (let i = 0; i < count; i++) {
    const prev = lines[(i - 1 + count) % count];
    const cur = lines[i];
    const cross = prev.dx * cur.dz - prev.dz * cur.dx;

    if (Math.abs(cross) < PARALLEL_EPS) {
      // Collinear neighbours (a wall split by a T-junction on the far side).
      result.push({ x: cur.px, z: cur.pz });
      continue;
    }

    const t =
      ((cur.px - prev.px) * cur.dz - (cur.pz - prev.pz) * cur.dx) / cross;

    result.push({ x: prev.px + prev.dx * t, z: prev.pz + prev.dz * t });
  }

  // Reject inversions: a shrunk edge must still run the same way as before.
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const ia = result[i];
    const ib = result[(i + 1) % count];

    const dot =
      (b.x - a.x) * (ib.x - ia.x) + (b.z - a.z) * (ib.z - ia.z);

    if (dot <= 0) {
      return null;
    }
  }

  return signedArea(result) > MIN_ROOM_AREA ? result : null;
}

function roomSignature(points: readonly RoomPoint[]): string {
  const keys = points.map((point) => {
    const x = Math.round(point.x * SIGNATURE_PRECISION);
    const z = Math.round(point.z * SIGNATURE_PRECISION);
    return `${x}:${z}`;
  });

  // Sorting makes the id independent of where the traversal started.
  keys.sort();

  return keys.join('|');
}

// --------------------------------
// Graph construction
// --------------------------------

function toSegments<TWall extends RoomWallLike>(
  walls: Iterable<TWall>,
): Segment<TWall>[] {
  const segments: Segment<TWall>[] = [];

  for (const wall of walls) {
    const start = wall.startPoint;
    const end = wall.endPoint;

    const dx = Math.abs(end.x - start.x);
    const dz = Math.abs(end.z - start.z);

    // Matches WallMesh.getOrientation(): walls are always axis aligned.
    const orientation: Orientation = dx >= dz ? 'x' : 'z';
    const width = Math.max(wall.width, 0.01);

    if (orientation === 'x') {
      const min = Math.min(start.x, end.x);
      const max = Math.max(start.x, end.x);

      if (max - min < MIN_SEGMENT_LENGTH) continue;

      segments.push({
        wall,
        orientation,
        axisPos: start.z,
        min,
        max,
        width,
      });
    } else {
      const min = Math.min(start.z, end.z);
      const max = Math.max(start.z, end.z);

      if (max - min < MIN_SEGMENT_LENGTH) continue;

      segments.push({
        wall,
        orientation,
        axisPos: start.x,
        min,
        max,
        width,
      });
    }
  }

  return segments;
}

function pointOnSegment<TWall extends RoomWallLike>(
  segment: Segment<TWall>,
  t: number,
): RoomPoint {
  return segment.orientation === 'x'
    ? { x: t, z: segment.axisPos }
    : { x: segment.axisPos, z: t };
}

function collectCandidates<TWall extends RoomWallLike>(
  segments: Segment<TWall>[],
): Candidate[] {
  const candidates: Candidate[] = [];

  const push = (segment: number, t: number, point: RoomPoint): void => {
    candidates.push({
      segment,
      t,
      x: point.x,
      z: point.z,
      radius: segments[segment].width / 2 + JOIN_EPS,
    });
  };

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    push(i, segment.min, pointOnSegment(segment, segment.min));
    push(i, segment.max, pointOnSegment(segment, segment.max));
  }

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const first = segments[i];
      const second = segments[j];

      if (first.orientation === second.orientation) {
        // Collinear neighbours are joined through their endpoints instead.
        continue;
      }

      const xIndex = first.orientation === 'x' ? i : j;
      const zIndex = first.orientation === 'x' ? j : i;
      const xSegment = segments[xIndex];
      const zSegment = segments[zIndex];

      const crossX = zSegment.axisPos;
      const crossZ = xSegment.axisPos;

      // A wall that was snapped against another one stops at its face, so its
      // centre line falls short of the other centre line by half a thickness.
      const xSlack = zSegment.width / 2 + JOIN_EPS;
      const zSlack = xSegment.width / 2 + JOIN_EPS;

      const touchesAlongX =
        crossX >= xSegment.min - xSlack && crossX <= xSegment.max + xSlack;
      const touchesAlongZ =
        crossZ >= zSegment.min - zSlack && crossZ <= zSegment.max + zSlack;

      if (!touchesAlongX || !touchesAlongZ) {
        continue;
      }

      const point: RoomPoint = { x: crossX, z: crossZ };

      push(xIndex, crossX, point);
      push(zIndex, crossZ, point);
    }
  }

  return candidates;
}

/**
 * Merges candidates that describe the same physical corner into one node.
 */
function clusterCandidates(candidates: Candidate[]): {
  roots: number[];
  positions: Map<number, RoomPoint>;
} {
  const parent = candidates.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }

    let walk = index;
    while (parent[walk] !== root) {
      const next = parent[walk];
      parent[walk] = root;
      walk = next;
    }

    return root;
  };

  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);

    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  };

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const tolerance = Math.max(a.radius, b.radius);

      if (Math.hypot(a.x - b.x, a.z - b.z) <= tolerance) {
        union(i, j);
      }
    }
  }

  const sums = new Map<number, { x: number; z: number; count: number }>();
  const roots = candidates.map((_, index) => find(index));

  for (let i = 0; i < candidates.length; i++) {
    const root = roots[i];
    const entry = sums.get(root) ?? { x: 0, z: 0, count: 0 };
    entry.x += candidates[i].x;
    entry.z += candidates[i].z;
    entry.count += 1;
    sums.set(root, entry);
  }

  const positions = new Map<number, RoomPoint>();

  for (const [root, entry] of sums) {
    positions.set(root, { x: entry.x / entry.count, z: entry.z / entry.count });
  }

  return { roots, positions };
}

function buildEdges<TWall extends RoomWallLike>(
  segments: Segment<TWall>[],
  candidates: Candidate[],
  nodeOfCandidate: number[],
): GraphEdge<TWall>[] {
  const bySegment = new Map<number, number[]>();

  for (let i = 0; i < candidates.length; i++) {
    const list = bySegment.get(candidates[i].segment);

    if (list) {
      list.push(i);
    } else {
      bySegment.set(candidates[i].segment, [i]);
    }
  }

  const edges: GraphEdge<TWall>[] = [];
  const seen = new Map<string, number>();

  for (const [segmentIndex, indices] of bySegment) {
    const segment = segments[segmentIndex];

    indices.sort((a, b) => candidates[a].t - candidates[b].t);

    const chain: number[] = [];

    for (const index of indices) {
      const node = nodeOfCandidate[index];

      if (chain[chain.length - 1] !== node) {
        chain.push(node);
      }
    }

    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i];
      const b = chain[i + 1];

      if (a === b) continue;

      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const existing = seen.get(key);

      if (existing !== undefined) {
        // Two walls between the same pair of nodes: keep the thicker one so
        // the floor is inset correctly.
        if (segment.width > edges[existing].width) {
          edges[existing] = {
            a,
            b,
            wall: segment.wall,
            width: segment.width,
          };
        }
        continue;
      }

      seen.set(key, edges.length);
      edges.push({ a, b, wall: segment.wall, width: segment.width });
    }
  }

  return edges;
}

/**
 * Drops every edge that cannot possibly be part of a closed loop.
 */
function pruneDanglingEdges<TWall extends RoomWallLike>(
  edges: GraphEdge<TWall>[],
  nodeCount: number,
): GraphEdge<TWall>[] {
  const alive = edges.map(() => true);
  let changed = true;

  while (changed) {
    changed = false;

    const degree = new Array<number>(nodeCount).fill(0);

    for (let i = 0; i < edges.length; i++) {
      if (!alive[i]) continue;
      degree[edges[i].a] += 1;
      degree[edges[i].b] += 1;
    }

    for (let i = 0; i < edges.length; i++) {
      if (!alive[i]) continue;

      if (degree[edges[i].a] < 2 || degree[edges[i].b] < 2) {
        alive[i] = false;
        changed = true;
      }
    }
  }

  return edges.filter((_, index) => alive[index]);
}

// --------------------------------
// Face traversal
// --------------------------------

interface FaceGraph<TWall extends RoomWallLike> {
  darts: Dart[];
  /** Position of each dart inside the sorted fan of its origin node. */
  dartOrder: number[];
  outgoing: Map<number, number[]>;
  edges: GraphEdge<TWall>[];
}

function buildFaceGraph<TWall extends RoomWallLike>(
  edges: GraphEdge<TWall>[],
  positions: RoomPoint[],
): FaceGraph<TWall> {
  const darts: Dart[] = [];

  for (let i = 0; i < edges.length; i++) {
    darts.push({ from: edges[i].a, to: edges[i].b, edge: i });
    darts.push({ from: edges[i].b, to: edges[i].a, edge: i });
  }

  const outgoing = new Map<number, number[]>();

  for (let i = 0; i < darts.length; i++) {
    const list = outgoing.get(darts[i].from);

    if (list) {
      list.push(i);
    } else {
      outgoing.set(darts[i].from, [i]);
    }
  }

  const angleOf = (dart: Dart): number => {
    const from = positions[dart.from];
    const to = positions[dart.to];
    return Math.atan2(to.z - from.z, to.x - from.x);
  };

  const dartOrder = new Array<number>(darts.length).fill(0);

  for (const list of outgoing.values()) {
    list.sort((a, b) => angleOf(darts[a]) - angleOf(darts[b]));

    for (let i = 0; i < list.length; i++) {
      dartOrder[list[i]] = i;
    }
  }

  return { darts, dartOrder, outgoing, edges };
}

/**
 * Next dart of the face that lies to the left of `dart`.
 *
 * Taking the neighbour that comes first in clockwise order after the way we
 * arrived keeps the traversal hugging the inside of the smallest possible
 * loop, which is exactly what separates real rooms from the big loop drawn
 * around a group of them.
 */
function nextDart<TWall extends RoomWallLike>(
  graph: FaceGraph<TWall>,
  dart: number,
): number {
  const reversed = dart ^ 1;
  const fan = graph.outgoing.get(graph.darts[reversed].from);

  if (!fan || fan.length === 0) {
    return reversed;
  }

  const index = graph.dartOrder[reversed];

  return fan[(index - 1 + fan.length) % fan.length];
}

// --------------------------------
// Public API
// --------------------------------

/**
 * Finds every closed region formed by the given walls.
 *
 * The result is ordered from the smallest to the largest room id so callers
 * get a deterministic list; callers are free to re-sort it.
 */
export function detectRooms<TWall extends RoomWallLike>(
  walls: Iterable<TWall>,
): DetectedRoom<TWall>[] {
  const segments = toSegments(walls);

  // A closed region needs at least three boundaries.
  if (segments.length < 3) {
    return [];
  }

  const candidates = collectCandidates(segments);
  const { roots, positions } = clusterCandidates(candidates);

  const nodeIndexOfRoot = new Map<number, number>();
  const nodePositions: RoomPoint[] = [];

  for (const [root, position] of positions) {
    nodeIndexOfRoot.set(root, nodePositions.length);
    nodePositions.push(position);
  }

  const nodeOfCandidate = roots.map(
    (root) => nodeIndexOfRoot.get(root) as number,
  );

  const edges = pruneDanglingEdges(
    buildEdges(segments, candidates, nodeOfCandidate),
    nodePositions.length,
  );

  if (edges.length < 3) {
    return [];
  }

  const graph = buildFaceGraph(edges, nodePositions);
  const visited = new Array<boolean>(graph.darts.length).fill(false);
  const rooms: DetectedRoom<TWall>[] = [];

  for (let start = 0; start < graph.darts.length; start++) {
    if (visited[start]) continue;

    const faceDarts: number[] = [];
    let current = start;

    do {
      visited[current] = true;
      faceDarts.push(current);
      current = nextDart(graph, current);
    } while (current !== start && !visited[current]);

    if (faceDarts.length < 3) {
      continue;
    }

    const centerline = faceDarts.map(
      (dart) => nodePositions[graph.darts[dart].from],
    );

    // The outer boundary of every group of walls comes out wound the other
    // way round, which is how it is told apart from the actual rooms.
    if (signedArea(centerline) <= MIN_ROOM_AREA) {
      continue;
    }

    const widths = faceDarts.map((dart) => edges[graph.darts[dart].edge].width);
    const polygon = insetPolygon(centerline, widths) ?? centerline;

    const roomWalls: TWall[] = [];

    for (const dart of faceDarts) {
      const wall = edges[graph.darts[dart].edge].wall;

      if (!roomWalls.includes(wall)) {
        roomWalls.push(wall);
      }
    }

    rooms.push({
      id: roomSignature(centerline),
      polygon,
      centerline,
      area: Math.abs(signedArea(polygon)),
      perimeter: polygonPerimeter(polygon),
      center: polygonCenter(polygon),
      bounds: polygonBounds(polygon),
      walls: roomWalls,
    });
  }

  rooms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return rooms;
}
