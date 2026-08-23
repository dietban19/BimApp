import * as THREE from 'three';
import { BaseMesh } from './BaseMesh';

export interface WallOptions {
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  height?: number;
  width?: number;
  isPreview?: boolean;
}

export type WallOrientation = 'x' | 'z';

export class WallMesh extends BaseMesh {
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  height: number;
  width: number;
  readonly isPreview: boolean;

  private edgesMesh?: THREE.LineSegments;

  constructor(options: WallOptions) {
    const isPreview = options.isPreview ?? false;
    const height = options.height ?? 3.0;
    const width = options.width ?? 0.3;

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
        color: 0xd1d5db,
        roughness: 0.5,
        metalness: 0.1,
      });
    }

    super(new THREE.BoxGeometry(1, 1, 1), defaultMat);

    this.isPreview = isPreview;
    this.startPoint = options.startPoint.clone();
    this.endPoint = options.endPoint.clone();
    this.height = height;
    this.width = width;

    if (!isPreview) {
      this.hoverMaterial = new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        roughness: 0.4,
      });
      this.selectMaterial = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.4,
      });

      // Edge outline for crisp appearance
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

  updateGeometry(): void {
    const orientation = this.getOrientation();
    const length = this.getLength();

    // Prevent 0-dimension geometry errors
    const safeLength = Math.max(length, 0.001);
    const safeHeight = Math.max(this.height, 0.01);
    const safeWidth = Math.max(this.width, 0.01);

    let dimX: number;
    let dimZ: number;

    if (orientation === 'x') {
      dimX = safeLength;
      dimZ = safeWidth;
    } else {
      dimX = safeWidth;
      dimZ = safeLength;
    }

    const newGeo = new THREE.BoxGeometry(dimX, safeHeight, dimZ);

    if (this.geometry) {
      this.geometry.dispose();
    }
    this.geometry = newGeo;

    // Calculate center position
    const midX = (this.startPoint.x + this.endPoint.x) / 2;
    const midY = safeHeight / 2;
    const midZ = (this.startPoint.z + this.endPoint.z) / 2;

    this.position.set(midX, midY, midZ);

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

  override dispose(): void {
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
