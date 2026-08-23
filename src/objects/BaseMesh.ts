import * as THREE from 'three';

export abstract class BaseMesh extends THREE.Mesh {
  readonly meshId: string = crypto.randomUUID();
  
  isSelected = false;
  isHovered = false;

  protected defaultMaterial: THREE.Material;
  protected hoverMaterial: THREE.Material;
  protected selectMaterial: THREE.Material;

  constructor(
    geometry?: THREE.BufferGeometry,
    material?: THREE.Material | THREE.Material[],
  ) {
    const baseMat = Array.isArray(material) ? material[0] : material;
    const defaultMat = baseMat ?? new THREE.MeshStandardMaterial({ color: 0xcccccc });

    super(geometry, defaultMat);

    this.defaultMaterial = defaultMat;
    this.hoverMaterial = new THREE.MeshStandardMaterial({ color: 0x64b5f6 });
    this.selectMaterial = new THREE.MeshStandardMaterial({ color: 0xffb74d });
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

  protected updateMaterialState(): void {
    if (this.isSelected) {
      this.material = this.selectMaterial;
    } else if (this.isHovered) {
      this.material = this.hoverMaterial;
    } else {
      this.material = this.defaultMaterial;
    }
  }

  dispose(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }

    this.disposeMaterial(this.defaultMaterial);
    this.disposeMaterial(this.hoverMaterial);
    this.disposeMaterial(this.selectMaterial);

    if (Array.isArray(this.material)) {
      for (const mat of this.material) {
        mat.dispose();
      }
    } else if (this.material) {
      this.material.dispose();
    }
  }

  private disposeMaterial(material: THREE.Material): void {
    if (material) {
      material.dispose();
    }
  }
}

export type BaseMeshComponent = BaseMesh;
