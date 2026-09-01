import * as THREE from 'three';

import { BaseMesh } from './BaseMesh';
import type { Opening } from './openings/Opening';
import { createProfileGeometry } from '../utils/profileGeometry';
import {
  validateOpeningPlacement,
  type OpeningValidation,
} from '../utils/openingLayout';
import type { OpeningParams } from '../types/Opening';
import { getPlasterTexture } from '../materials/proceduralTextures';

export interface WallOptions {
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  height?: number;
  width?: number;
  isPreview?: boolean;
  isRoomBoundary?: boolean;
}

export type WallOrientation = 'x' | 'z';

/**
 * Notified when openings had to be dropped because the wall no longer fits
 * them (for example after the height was reduced).
 *
 * The wall detaches them from the scene graph but leaves ownership of the
 * disposal and of any world registration to the caller that placed them.
 */
export type OpeningsRemovedHandler = (openings: Opening[]) => void;

export class WallMesh extends BaseMesh {
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  height: number;
  width: number;
  readonly isPreview: boolean;
  isRoomBoundary: boolean;

  onOpeningsRemoved?: OpeningsRemovedHandler;

  private edgesMesh?: THREE.LineSegments;

  /** Openings that belong to this wall, in placement order. */
  private readonly openingList: Opening[] = [];

  constructor(options: WallOptions) {
    const isPreview = options.isPreview ?? false;
    const height = options.height ?? 3.0;
    const width = options.width ?? 0.3;
    console.log('width', width);

    let defaultMat: THREE.Material;
    if (isPreview) {
      defaultMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        roughness: 0.3,
      });
    } else {
      defaultMat = new THREE.MeshStandardMaterial({
        map: getPlasterTexture(),
        roughness: 0.85,
        metalness: 0.02,
      });
    }

    super(new THREE.BoxGeometry(1, 1, 1), defaultMat);

    this.castShadow = !isPreview;
    this.receiveShadow = !isPreview;

    this.isPreview = isPreview;
    this.isRoomBoundary = options.isRoomBoundary ?? true;
    this.startPoint = options.startPoint.clone();
    this.endPoint = options.endPoint.clone();
    this.height = height;
    this.width = width;

    if (!isPreview) {
      this.hoverMaterial = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        roughness: 0.4,
        transparent: true,
        opacity: 0.85,
      });
      this.selectMaterial = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.4,
      });

      // Edge outline for crisp architectural appearance
      const edgeGeo = new THREE.EdgesGeometry(this.geometry);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x374151,
        linewidth: 1,
      });
      this.edgesMesh = new THREE.LineSegments(edgeGeo, edgeMat);
      this.add(this.edgesMesh);
    }

    this.updateGeometry();
  }

  protected override updateMaterialState(): void {
    super.updateMaterialState();

    if (this.edgesMesh) {
      const edgeMat = this.edgesMesh.material as THREE.LineBasicMaterial;
      if (this.isSelected) {
        edgeMat.color.setHex(0xf59e0b); // Vibrant orange edge for selected wall
      } else if (this.isHovered) {
        edgeMat.color.setHex(0x60a5fa); // Sky blue edge for hovered wall
      } else {
        edgeMat.color.setHex(0x374151); // Dark neutral edge
      }
    }
  }

  getOrientation(): WallOrientation {
    const dx = Math.abs(this.endPoint.x - this.startPoint.x);
    const dz = Math.abs(this.endPoint.z - this.startPoint.z);
    return dx >= dz ? 'x' : 'z';
  }

  getLength(): number {
    const orientation = this.getOrientation();
    if (orientation === 'x') {
      return Math.abs(this.endPoint.x - this.startPoint.x);
    } else {
      return Math.abs(this.endPoint.z - this.startPoint.z);
    }
  }

  setEndpoints(start: THREE.Vector3, end: THREE.Vector3): void {
    this.startPoint.copy(start);
    this.endPoint.copy(end);
    this.updateGeometry();
  }

  setHeight(h: number): void {
    if (h <= 0 || !Number.isFinite(h)) return;
    this.height = h;
    this.updateGeometry();
  }

  setWidth(w: number): void {
    if (w <= 0 || !Number.isFinite(w)) return;
    this.width = w;
    this.updateGeometry();
  }

  setRoomBoundary(enabled: boolean): void {
    this.isRoomBoundary = enabled;
  }

  // --------------------------------
  // Openings
  // --------------------------------

  /**
   * The doors and windows that currently belong to this wall.
   */
  get openings(): readonly Opening[] {
    return this.openingList;
  }

  /**
   * Checks whether an opening description fits this wall.
   *
   * `ignore` lets an existing opening be re-validated against its siblings
   * without clashing with its own current footprint.
   */
  canPlaceOpening(params: OpeningParams, ignore?: Opening): OpeningValidation {
    const others = this.openingList
      .filter((opening) => opening !== ignore)
      .map((opening) => opening.getFootprint());

    return validateOpeningPlacement(
      params,
      this.getLength(),
      this.height,
      others,
    );
  }

  /**
   * Cuts an opening into this wall.
   *
   * Returns false and leaves the wall untouched when the placement is invalid.
   */
  addOpening(opening: Opening): boolean {
    if (this.isPreview || this.openingList.includes(opening)) {
      return false;
    }

    if (!this.canPlaceOpening(opening.getParams()).valid) {
      return false;
    }

    this.openingList.push(opening);
    opening.setWall(this);
    this.add(opening);

    this.updateGeometry();

    return true;
  }

  /**
   * Detaches an opening so the wall becomes solid again.
   *
   * The opening itself is not disposed; the caller keeps ownership of it.
   */
  removeOpening(opening: Opening): boolean {
    const index = this.openingList.indexOf(opening);

    if (index === -1) {
      return false;
    }

    this.openingList.splice(index, 1);
    this.remove(opening);
    opening.setWall(null);

    this.updateGeometry();

    return true;
  }

  /**
   * Resizes / moves an existing opening, rejecting invalid results.
   */
  updateOpening(opening: Opening, params: OpeningParams): boolean {
    if (!this.openingList.includes(opening)) {
      return false;
    }

    if (!this.canPlaceOpening(params, opening).valid) {
      return false;
    }

    opening.setParams(params);
    this.updateGeometry();

    return true;
  }

  /**
   * Drops openings that no longer fit after the wall changed.
   *
   * Openings are checked in placement order, so the oldest ones win.
   */
  private pruneInvalidOpenings(): void {
    if (this.openingList.length === 0) {
      return;
    }

    const length = this.getLength();
    const kept: Opening[] = [];
    const removed: Opening[] = [];

    for (const opening of this.openingList) {
      const validation = validateOpeningPlacement(
        opening.getParams(),
        length,
        this.height,
        kept.map((other) => other.getFootprint()),
      );

      if (validation.valid) {
        kept.push(opening);
      } else {
        removed.push(opening);
      }
    }

    if (removed.length === 0) {
      return;
    }

    this.openingList.length = 0;
    this.openingList.push(...kept);

    for (const opening of removed) {
      this.remove(opening);
      opening.setWall(null);
    }

    this.onOpeningsRemoved?.(removed);
  }

  // --------------------------------
  // Geometry
  // --------------------------------

  updateGeometry(): void {
    const orientation = this.getOrientation();

    // Prevent 0-dimension geometry errors
    const safeLength = Math.max(this.getLength(), 0.001);
    const safeHeight = Math.max(this.height, 0.01);
    const safeWidth = Math.max(this.width, 0.01);

    this.pruneInvalidOpenings();

    const cutouts = this.openingList.map((opening) => opening.getFootprint());

    const newGeo = createProfileGeometry(
      safeLength,
      safeHeight,
      safeWidth,
      cutouts,
    );

    if (this.geometry) {
      this.geometry.dispose();
    }
    this.geometry = newGeo;

    // The profile runs along local X and starts at local y = 0, so the wall is
    // centred horizontally and stands on the floor.
    const midX = (this.startPoint.x + this.endPoint.x) / 2;
    const midZ = (this.startPoint.z + this.endPoint.z) / 2;

    this.position.set(midX, 0, midZ);
    this.rotation.set(0, orientation === 'x' ? 0 : -Math.PI / 2, 0);

    // Openings depend on the wall length and thickness.
    for (const opening of this.openingList) {
      opening.build();
    }

    // Keep picking correct even between two renders.
    this.updateMatrixWorld(true);

    if (this.edgesMesh) {
      if (this.edgesMesh.geometry) {
        this.edgesMesh.geometry.dispose();
      }
      this.edgesMesh.geometry = new THREE.EdgesGeometry(newGeo);
    }
  }

  /**
   * Returns Axis-Aligned Bounding Box (AABB) in XZ ground plane.
   */
  getXZBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const orientation = this.getOrientation();
    const halfW = this.width / 2;

    if (orientation === 'x') {
      const minX = Math.min(this.startPoint.x, this.endPoint.x);
      const maxX = Math.max(this.startPoint.x, this.endPoint.x);
      const minZ = this.startPoint.z - halfW;
      const maxZ = this.startPoint.z + halfW;
      return { minX, maxX, minZ, maxZ };
    } else {
      const minZ = Math.min(this.startPoint.z, this.endPoint.z);
      const maxZ = Math.max(this.startPoint.z, this.endPoint.z);
      const minX = this.startPoint.x - halfW;
      const maxX = this.startPoint.x + halfW;
      return { minX, maxX, minZ, maxZ };
    }
  }

  /**
   * Converts a world space point (typically a raycast hit) into the distance
   * along the wall, measured from its min end.
   */
  getDistanceAlongWall(worldPoint: THREE.Vector3): number {
    this.updateWorldMatrix(true, false);

    const local = this.worldToLocal(worldPoint.clone());

    return local.x + this.getLength() / 2;
  }

  override dispose(): void {
    for (const opening of this.openingList) {
      this.remove(opening);
      opening.setWall(null);
      opening.dispose();
    }
    this.openingList.length = 0;
    this.onOpeningsRemoved = undefined;

    if (this.edgesMesh) {
      this.edgesMesh.geometry.dispose();
      if (Array.isArray(this.edgesMesh.material)) {
        this.edgesMesh.material.forEach((m) => m.dispose());
      } else {
        this.edgesMesh.material.dispose();
      }
    }
    super.dispose();
  }
}
