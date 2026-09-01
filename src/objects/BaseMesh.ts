import * as THREE from 'three';

export abstract class BaseMesh extends THREE.Mesh {
  readonly meshId: string = crypto.randomUUID();
  
  isSelected = false;
  isHovered = false;

  customMaterial: THREE.Material | null = null;
  customMaterialId: string | null = null;
  previewMaterial: THREE.Material | null = null;

  protected defaultMaterial: THREE.Material;
  protected hoverMaterial: THREE.Material;
  protected selectMaterial: THREE.Material;

  constructor(
    geometry?: THREE.BufferGeometry,
    material?: THREE.Material | THREE.Material[],
  ) {
    const baseMat = Array.isArray(material) ? material[0] : material;
    const defaultMat = baseMat ?? new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.7 });

    super(geometry, defaultMat);

    this.castShadow = true;
    this.receiveShadow = true;

    this.defaultMaterial = defaultMat;
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
  }

  setSelected(selected: boolean): void {
    if (this.isSelected === selected) return;
    this.isSelected = selected;
    this.updateMaterialState();
  }

  setHovered(hovered: boolean): void {
    if (this.isHovered === hovered) return;
    this.isHovered = hovered;
    this.updateMaterialState();
  }

  setCustomMaterial(material: THREE.Material | null, materialId?: string): void {
    this.customMaterial = material;
    this.customMaterialId = materialId ?? (material ? 'custom' : null);
    this.updateMaterialState();
  }

  getCustomMaterial(): THREE.Material | null {
    return this.customMaterial;
  }

  getCustomMaterialId(): string | null {
    return this.customMaterialId;
  }

  setPreviewMaterial(material: THREE.Material | null): void {
    this.previewMaterial = material;
    this.updateMaterialState();
  }

  protected updateMaterialState(): void {
    if (this.previewMaterial) {
      this.material = this.previewMaterial;
      return;
    }

    const currentBase = this.customMaterial ?? this.defaultMaterial;

    if (this.isSelected) {
      // Show actual realistic material on the faces when selected, with edges highlighted
      this.material = currentBase;
    } else if (this.isHovered) {
      this.material = this.hoverMaterial;
    } else {
      this.material = currentBase;
    }
  }

  dispose(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }

    this.disposeMaterial(this.defaultMaterial);
    this.disposeMaterial(this.hoverMaterial);
    this.disposeMaterial(this.selectMaterial);
    this.previewMaterial = null;
    this.customMaterial = null;
  }

  protected disposeMaterial(material?: THREE.Material | null): void {
    if (material) {
      material.dispose();
    }
  }
}

export type BaseMeshComponent = BaseMesh;
