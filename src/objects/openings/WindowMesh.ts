import * as THREE from 'three';

import { Opening } from './Opening';
import { createFrameGeometry } from '../../utils/profileGeometry';
import type { OpeningParams, OpeningType } from '../../types/Opening';

/** Width of the window frame members. */
const FRAME_WIDTH = 0.06;

/** Thickness of the glazing. */
const GLASS_THICKNESS = 0.02;

/** The frame reaches slightly into the wall to avoid coplanar faces. */
const FRAME_EMBED = 0.003;

/** Width of the cross mullions. */
const MULLION_WIDTH = 0.03;

function createGlassMaterial(
  color: number,
  opacity: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.08,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

/**
 * A window: a hole that floats above floor level, filled with a frame,
 * a pair of mullions and a glazed pane.
 *
 * The pane is the mesh body, so the whole glazed area is pickable.
 */
export class WindowMesh extends Opening {
  readonly type: OpeningType = 'window';

  constructor(params: OpeningParams, isPreview = false) {
    super(params, isPreview);

    this.replaceMaterials(
      createGlassMaterial(0x9ecbff, 0.3),
      createGlassMaterial(0x60a5fa, 0.5),
      createGlassMaterial(0xf59e0b, 0.55),
    );
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

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3f4f6,
      roughness: 0.55,
    });

    const frame = new THREE.Mesh(frameGeometry, frameMaterial);

    const mullionDepth = GLASS_THICKNESS + 0.02;

    const vertical = new THREE.Mesh(
      new THREE.BoxGeometry(MULLION_WIDTH, glass.height, mullionDepth),
      frameMaterial,
    );

    const horizontal = new THREE.Mesh(
      new THREE.BoxGeometry(glass.width, MULLION_WIDTH, mullionDepth),
      frameMaterial,
    );

    return [frame, vertical, horizontal];
  }
}
