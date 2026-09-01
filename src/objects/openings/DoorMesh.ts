import * as THREE from 'three';

import { Opening } from './Opening';
import { createFrameGeometry } from '../../utils/profileGeometry';
import type { OpeningParams, OpeningType } from '../../types/Opening';
import { getWoodTexture } from '../../materials/proceduralTextures';

/** Width of the door jamb members. */
const JAMB_WIDTH = 0.05;

/** Thickness of the door leaf. */
const LEAF_THICKNESS = 0.05;

/** Gap between the leaf and the jamb so they do not z-fight. */
const LEAF_CLEARANCE = 0.008;

/** The jamb reaches slightly into the wall to avoid coplanar faces. */
const FRAME_EMBED = 0.003;

/** Standard handle height above floor level. */
const HANDLE_HEIGHT = 1.02;

/**
 * A door: a hole down to floor level with a frame and a hinged leaf.
 *
 * The leaf is the mesh body itself, which means it is also the surface the
 * user picks when selecting the door.
 */
export class DoorMesh extends Opening {
  readonly type: OpeningType = 'door';

  leafMaterialId = 'wall-oak';
  frameMaterialId = 'trim-white';

  private frameMaterial: THREE.Material;

  constructor(params: OpeningParams, isPreview = false) {
    super(params, isPreview);

    const defaultLeaf = new THREE.MeshStandardMaterial({
      map: getWoodTexture(false),
      roughness: 0.55,
      metalness: 0.02,
    });

    const hoverLeaf = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      roughness: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    const selectLeaf = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.45,
    });

    this.frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.05,
    });

    this.replaceMaterials(defaultLeaf, hoverLeaf, selectLeaf);
  }

  setLeafMaterial(material: THREE.Material, id = 'custom'): void {
    this.leafMaterialId = id;
    this.setCustomMaterial(material, id);
  }

  getLeafMaterial(): THREE.Material {
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

  private getLeafSize(wallThickness: number): {
    width: number;
    height: number;
    depth: number;
  } {
    return {
      width: Math.max(this.width - 2 * JAMB_WIDTH - LEAF_CLEARANCE, 0.02),
      height: Math.max(this.height - JAMB_WIDTH - LEAF_CLEARANCE, 0.02),
      depth: Math.max(Math.min(LEAF_THICKNESS, wallThickness * 0.6), 0.01),
    };
  }

  protected createBodyGeometry(wallThickness: number): THREE.BufferGeometry {
    const leaf = this.getLeafSize(wallThickness);

    const geometry = new THREE.BoxGeometry(leaf.width, leaf.height, leaf.depth);

    // The leaf stands on the floor, the opening origin is at its centre.
    geometry.translate(0, -this.height / 2 + leaf.height / 2, 0);

    return geometry;
  }

  protected createDecorations(wallThickness: number): THREE.Object3D[] {
    const leaf = this.getLeafSize(wallThickness);

    const jambGeometry = createFrameGeometry({
      outerWidth: this.width + 2 * FRAME_EMBED,
      outerHeight: this.height + FRAME_EMBED,
      depth: Math.max(wallThickness - 2 * FRAME_EMBED, 0.01),
      thickness: JAMB_WIDTH + FRAME_EMBED,
      openBottom: true,
    });

    // createFrameGeometry centres on the outer height; realign to the opening.
    jambGeometry.translate(0, FRAME_EMBED / 2, 0);

    const jamb = new THREE.Mesh(jambGeometry, this.frameMaterial);

    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 14, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.85,
        roughness: 0.2,
      }),
    );

    handle.position.set(
      leaf.width / 2 - 0.08,
      -this.height / 2 + Math.min(HANDLE_HEIGHT, this.height * 0.5),
      leaf.depth / 2 + 0.025,
    );

    return [jamb, handle];
  }

  override dispose(): void {
    this.frameMaterial.dispose();
    super.dispose();
  }
}
