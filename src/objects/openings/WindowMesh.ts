import * as THREE from 'three';

import { Opening } from './Opening';
import { createFrameGeometry } from '../../utils/profileGeometry';
import type { OpeningParams, OpeningType } from '../../types/Opening';
import { createPhysicalGlassMaterial } from '../../materials/materialLibrary';

/** Width of the window frame members. */
const FRAME_WIDTH = 0.06;

/** Thickness of the glazing. */
const GLASS_THICKNESS = 0.02;

/** The frame reaches slightly into the wall to avoid coplanar faces. */
const FRAME_EMBED = 0.003;

/** Width of the cross mullions. */
const MULLION_WIDTH = 0.03;

/**
 * A window: a hole that floats above floor level, filled with a frame,
 * a pair of mullions and a glazed physical pane.
 *
 * The pane is the mesh body, so the whole glazed area is pickable.
 */
export class WindowMesh extends Opening {
  readonly type: OpeningType = 'window';

  glassMaterialId = 'glass-clear';
  frameMaterialId = 'trim-white';

  private frameMaterial: THREE.Material;

  constructor(params: OpeningParams, isPreview = false) {
    super(params, isPreview);

    const defaultGlass = createPhysicalGlassMaterial({
      color: 0xffffff,
      transmission: 0.94,
      roughness: 0.03,
      ior: 1.52,
      thickness: 0.05,
    });

    const hoverGlass = createPhysicalGlassMaterial({
      color: 0x93c5fd,
      transmission: 0.85,
      roughness: 0.15,
      ior: 1.52,
      thickness: 0.05,
    });

    const selectGlass = createPhysicalGlassMaterial({
      color: 0xfde68a,
      transmission: 0.82,
      roughness: 0.1,
      ior: 1.52,
      thickness: 0.05,
    });

    this.frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.05,
    });

    this.replaceMaterials(defaultGlass, hoverGlass, selectGlass);
  }

  setGlassMaterial(material: THREE.Material, id = 'custom'): void {
    this.glassMaterialId = id;
    this.setCustomMaterial(material, id);
  }

  getGlassMaterial(): THREE.Material {
    return this.customMaterial ?? this.defaultMaterial;
  }

  setFrameMaterial(material: THREE.Material, id = 'custom'): void {
    this.frameMaterialId = id;
    this.frameMaterial = material;
    this.build();
  }

  getFrameMaterial(): THREE.Material {
    return this.frameMaterial;
  }

  private getGlassSize(): { width: number; height: number } {
    return {
      width: Math.max(this.width - 2 * FRAME_WIDTH, 0.02),
      height: Math.max(this.height - 2 * FRAME_WIDTH, 0.02),
    };
  }

  protected createBodyGeometry(): THREE.BufferGeometry {
    const glass = this.getGlassSize();

    return new THREE.BoxGeometry(glass.width, glass.height, GLASS_THICKNESS);
  }

  protected createDecorations(wallThickness: number): THREE.Object3D[] {
    const glass = this.getGlassSize();

    const frameGeometry = createFrameGeometry({
      outerWidth: this.width + 2 * FRAME_EMBED,
      outerHeight: this.height + 2 * FRAME_EMBED,
      depth: Math.max(wallThickness - 2 * FRAME_EMBED, 0.01),
      thickness: FRAME_WIDTH + FRAME_EMBED,
    });

    const frame = new THREE.Mesh(frameGeometry, this.frameMaterial);

    const mullionDepth = GLASS_THICKNESS + 0.02;

    const vertical = new THREE.Mesh(
      new THREE.BoxGeometry(MULLION_WIDTH, glass.height, mullionDepth),
      this.frameMaterial,
    );

    const horizontal = new THREE.Mesh(
      new THREE.BoxGeometry(glass.width, MULLION_WIDTH, mullionDepth),
      this.frameMaterial,
    );

    return [frame, vertical, horizontal];
  }

  override dispose(): void {
    this.frameMaterial.dispose();
    super.dispose();
  }
}
