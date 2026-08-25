import * as THREE from 'three';

import { BaseMesh } from '../BaseMesh';
import { disposeObject3D } from '../../utils/dispose';
import { getOpeningFootprint } from '../../utils/openingLayout';
import type { RectCutout } from '../../utils/profileGeometry';
import type { OpeningParams, OpeningType } from '../../types/Opening';
import type { WallMesh } from '../WallMesh';

const PREVIEW_VALID_COLOR = 0x22c55e;
const PREVIEW_INVALID_COLOR = 0xef4444;

/** Used while an opening is not attached to a wall yet. */
const FALLBACK_WALL_THICKNESS = 0.3;

/** Previews are drawn on top of the still solid wall so they stay visible. */
const PREVIEW_RENDER_ORDER = 1000;

/**
 * Base class for everything that can be cut into a wall.
 *
 * An `Opening` is both the model (position + size inside its wall) and the
 * visual representation that is placed inside the hole. Concrete subclasses
 * only have to describe:
 *
 *  - the "body" geometry, which doubles as the pickable surface, and
 *  - any decorative sub meshes (frames, mullions, handles, ...).
 *
 * The opening is added as a child of its `WallMesh`, so it automatically
 * follows the wall's position and orientation for both X and Z walls.
 */
export abstract class Opening extends BaseMesh {
  abstract readonly type: OpeningType;

  readonly isPreview: boolean;

  private params: OpeningParams;

  private wallRef: WallMesh | null = null;

  private readonly decorations: THREE.Object3D[] = [];

  private previewMaterial: THREE.MeshStandardMaterial | null = null;

  protected constructor(params: OpeningParams, isPreview: boolean) {
    super();

    this.isPreview = isPreview;
    this.params = { ...params };

    if (isPreview) {
      this.previewMaterial = new THREE.MeshStandardMaterial({
        color: PREVIEW_VALID_COLOR,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
        depthWrite: false,
        roughness: 0.35,
      });

      this.renderOrder = PREVIEW_RENDER_ORDER;
    }
  }

  // --------------------------------
  // Model
  // --------------------------------

  get wall(): WallMesh | null {
    return this.wallRef;
  }

  get distanceAlongWall(): number {
    return this.params.distanceAlongWall;
  }

  get width(): number {
    return this.params.width;
  }

  get height(): number {
    return this.params.height;
  }

  get sillHeight(): number {
    return this.params.sillHeight;
  }

  getParams(): OpeningParams {
    return { ...this.params };
  }

  getFootprint(): RectCutout {
    return getOpeningFootprint(this.params);
  }

  /**
   * Replaces the opening description.
   *
   * Callers are responsible for validating the new values against the wall
   * (see {@link WallMesh.updateOpening}) and for rebuilding afterwards.
   */
  setParams(params: OpeningParams): void {
    this.params = { ...params };
  }

  /**
   * Slides the opening along its wall.
   *
   * Only the transform changes, so this is cheap enough to call on every
   * pointer move while dragging a preview around.
   */
  setDistanceAlongWall(distanceAlongWall: number): void {
    this.params.distanceAlongWall = distanceAlongWall;
    this.updateTransform();
  }

  /**
   * Wires the opening to its wall. Called by {@link WallMesh}.
   */
  setWall(wall: WallMesh | null): void {
    this.wallRef = wall;
  }

  // --------------------------------
  // Geometry
  // --------------------------------

  /**
   * (Re)creates the body geometry, the decorations and the local transform.
   *
   * Called whenever the opening or its host wall changes, so a wall can be
   * resized or re-thicknessed without losing its openings.
   */
  build(): void {
    const wallThickness = this.wallRef?.width ?? FALLBACK_WALL_THICKNESS;

    const body = this.createBodyGeometry(wallThickness);

    this.geometry?.dispose();
    this.geometry = body;

    this.clearDecorations();

    for (const decoration of this.createDecorations(wallThickness)) {
      this.decorations.push(decoration);
      this.add(decoration);
    }

    if (this.isPreview) {
      this.applyPreviewMaterials();
    }

    this.updateTransform();
  }

  protected abstract createBodyGeometry(
    wallThickness: number,
  ): THREE.BufferGeometry;

  protected abstract createDecorations(
    wallThickness: number,
  ): THREE.Object3D[];

  /**
   * Positions the opening inside its wall's local frame.
   *
   * The wall geometry is centred on X and starts at y = 0, so the opening
   * centre is simply "distance from the min end minus half the wall length".
   */
  private updateTransform(): void {
    const wallLength = this.wallRef?.getLength() ?? this.params.width;

    this.position.set(
      this.params.distanceAlongWall - wallLength / 2,
      this.params.sillHeight + this.params.height / 2,
      0,
    );
  }

  private clearDecorations(): void {
    const keep = this.previewMaterial
      ? new Set<THREE.Material>([this.previewMaterial])
      : undefined;

    for (const decoration of this.decorations) {
      this.remove(decoration);
      disposeObject3D(decoration, keep);
    }

    this.decorations.length = 0;
  }

  // --------------------------------
  // Materials
  // --------------------------------

  /**
   * Lets subclasses install their own look while keeping ownership of the
   * materials created by {@link BaseMesh}.
   */
  protected replaceMaterials(
    defaultMaterial: THREE.Material,
    hoverMaterial: THREE.Material,
    selectMaterial: THREE.Material,
  ): void {
    this.defaultMaterial.dispose();
    this.hoverMaterial.dispose();
    this.selectMaterial.dispose();

    this.defaultMaterial = defaultMaterial;
    this.hoverMaterial = hoverMaterial;
    this.selectMaterial = selectMaterial;

    this.updateMaterialState();
  }

  protected override updateMaterialState(): void {
    if (this.isPreview && this.previewMaterial) {
      this.material = this.previewMaterial;
      return;
    }

    super.updateMaterialState();
  }

  private applyPreviewMaterials(): void {
    const material = this.previewMaterial;

    if (!material) {
      return;
    }

    this.material = material;

    for (const decoration of this.decorations) {
      decoration.traverse((child) => {
        child.renderOrder = PREVIEW_RENDER_ORDER;

        const mesh = child as Partial<THREE.Mesh>;

        if (!mesh.material || mesh.material === material) {
          return;
        }

        // The decoration's own material is not needed for a ghost preview.
        const previous = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];

        for (const item of previous) {
          item.dispose();
        }

        mesh.material = material;
      });
    }
  }

  /**
   * Colours a preview green or red depending on whether it can be placed.
   */
  setPreviewValid(valid: boolean): void {
    this.previewMaterial?.color.setHex(
      valid ? PREVIEW_VALID_COLOR : PREVIEW_INVALID_COLOR,
    );
  }

  override dispose(): void {
    this.clearDecorations();

    this.material = this.defaultMaterial;

    if (this.previewMaterial) {
      this.previewMaterial.dispose();
      this.previewMaterial = null;
    }

    this.wallRef = null;

    super.dispose();
  }
}
