import * as THREE from 'three';
import {
  getBrickTexture,
  getConcreteTexture,
  getMarbleTexture,
  getPlasterTexture,
  getSlateTexture,
  getTileTexture,
  getWoodTexture,
} from './proceduralTextures';

export type MaterialCategory = 'wall' | 'glass' | 'wood' | 'metal' | 'concrete' | 'tiles' | 'custom';

export interface MaterialDefinition {
  id: string;
  name: string;
  category: MaterialCategory;
  material: THREE.Material;
  isGlass?: boolean;
  description?: string;
}

let libraryInitialized = false;
const materialRegistry = new Map<string, MaterialDefinition>();

/**
 * Creates photorealistic glass materials using MeshPhysicalMaterial.
 * These respond to lighting, reflections, transmission and specular highlights.
 */
export function createPhysicalGlassMaterial(options: {
  color?: THREE.ColorRepresentation;
  transmission?: number;
  roughness?: number;
  ior?: number;
  thickness?: number;
  opacity?: number;
  reflectivity?: number;
}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: options.color ?? 0xffffff,
    transparent: true,
    opacity: options.opacity ?? 1.0,
    transmission: options.transmission ?? 0.94,
    roughness: options.roughness ?? 0.04,
    metalness: 0.0,
    ior: options.ior ?? 1.52, // Standard soda-lime architectural glass
    thickness: options.thickness ?? 0.05,
    specularIntensity: 1.0,
    specularColor: new THREE.Color(0xffffff),
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
    shadowSide: THREE.DoubleSide,
  });
}

function initBuiltinMaterials(): void {
  if (libraryInitialized) return;
  libraryInitialized = true;

  // ----------------------------------------------------
  // Glass Materials (For Windows)
  // ----------------------------------------------------
  const glassClear = createPhysicalGlassMaterial({
    color: 0xffffff,
    transmission: 0.95,
    roughness: 0.03,
    ior: 1.52,
    thickness: 0.04,
  });

  const glassFrosted = createPhysicalGlassMaterial({
    color: 0xf1f5f9,
    transmission: 0.82,
    roughness: 0.42,
    ior: 1.45,
    thickness: 0.08,
  });

  const glassBlueTint = createPhysicalGlassMaterial({
    color: 0x93c5fd,
    transmission: 0.90,
    roughness: 0.05,
    ior: 1.52,
    thickness: 0.05,
  });

  const glassSmoked = createPhysicalGlassMaterial({
    color: 0x475569,
    transmission: 0.72,
    roughness: 0.06,
    ior: 1.54,
    thickness: 0.06,
  });

  const glassEmerald = createPhysicalGlassMaterial({
    color: 0x6ee7b7,
    transmission: 0.88,
    roughness: 0.04,
    ior: 1.52,
    thickness: 0.05,
  });

  const glassAmber = createPhysicalGlassMaterial({
    color: 0xfcd34d,
    transmission: 0.85,
    roughness: 0.05,
    ior: 1.52,
    thickness: 0.05,
  });

  // ----------------------------------------------------
  // Wall Materials
  // ----------------------------------------------------
  const matPlaster = new THREE.MeshStandardMaterial({
    map: getPlasterTexture(),
    roughness: 0.85,
    metalness: 0.02,
  });

  const matConcrete = new THREE.MeshStandardMaterial({
    map: getConcreteTexture(),
    roughness: 0.92,
    metalness: 0.05,
  });

  const matBrick = new THREE.MeshStandardMaterial({
    map: getBrickTexture(),
    roughness: 0.78,
    metalness: 0.04,
  });

  const matOak = new THREE.MeshStandardMaterial({
    map: getWoodTexture(false),
    roughness: 0.55,
    metalness: 0.02,
  });

  const matWalnut = new THREE.MeshStandardMaterial({
    map: getWoodTexture(true),
    roughness: 0.45,
    metalness: 0.02,
  });

  const matTile = new THREE.MeshStandardMaterial({
    map: getTileTexture(),
    roughness: 0.18,
    metalness: 0.08,
  });

  const matMarble = new THREE.MeshStandardMaterial({
    map: getMarbleTexture(),
    roughness: 0.22,
    metalness: 0.05,
  });

  const matSlate = new THREE.MeshStandardMaterial({
    map: getSlateTexture(),
    roughness: 0.65,
    metalness: 0.15,
  });

  const matStucco = new THREE.MeshStandardMaterial({
    color: 0xdfd7c9,
    map: getPlasterTexture(),
    roughness: 0.9,
    metalness: 0.0,
  });

  // ----------------------------------------------------
  // Metal & Finish Materials
  // ----------------------------------------------------
  const matAluminum = new THREE.MeshStandardMaterial({
    color: 0xd6d3d1,
    roughness: 0.35,
    metalness: 0.85,
  });

  const matDarkSteel = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.4,
    metalness: 0.75,
  });

  const matBrass = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.85,
  });

  const matWhitePainted = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.05,
  });

  const list: MaterialDefinition[] = [
    // Wall Presets
    { id: 'wall-plaster', name: 'White Plaster', category: 'wall', material: matPlaster, description: 'Smooth matte architectural plaster' },
    { id: 'wall-concrete', name: 'Raw Concrete', category: 'concrete', material: matConcrete, description: 'Industrial architectural concrete' },
    { id: 'wall-brick', name: 'Red Brick', category: 'wall', material: matBrick, description: 'Traditional exposed brick masonry' },
    { id: 'wall-oak', name: 'Oak Wood Panels', category: 'wood', material: matOak, description: 'Warm natural timber siding' },
    { id: 'wall-walnut', name: 'Dark Walnut', category: 'wood', material: matWalnut, description: 'Rich dark luxury hardwood' },
    { id: 'wall-tiles', name: 'Ceramic Subway Tiles', category: 'tiles', material: matTile, description: 'Glossy ceramic wall tiles' },
    { id: 'wall-marble', name: 'Carrara Marble', category: 'wall', material: matMarble, description: 'Polished white Italian marble' },
    { id: 'wall-slate', name: 'Charcoal Slate', category: 'wall', material: matSlate, description: 'Modern dark architectural slate' },
    { id: 'wall-stucco', name: 'Warm Stucco', category: 'wall', material: matStucco, description: 'Textured mediterranean stucco' },

    // Glass Presets
    { id: 'glass-clear', name: 'Clear Glass', category: 'glass', material: glassClear, isGlass: true, description: 'Ultra-clear physical architectural glass' },
    { id: 'glass-frosted', name: 'Frosted Glass', category: 'glass', material: glassFrosted, isGlass: true, description: 'Translucent diffused privacy glass' },
    { id: 'glass-blue', name: 'Solar Blue Glass', category: 'glass', material: glassBlueTint, isGlass: true, description: 'Light blue solar reflective glass' },
    { id: 'glass-smoked', name: 'Smoked Charcoal Glass', category: 'glass', material: glassSmoked, isGlass: true, description: 'Dark tinted modern glass' },
    { id: 'glass-emerald', name: 'Emerald Glass', category: 'glass', material: glassEmerald, isGlass: true, description: 'Architectural subtle green tint glass' },
    { id: 'glass-amber', name: 'Amber Glass', category: 'glass', material: glassAmber, isGlass: true, description: 'Warm amber decorative glass' },

    // Metal & Trim
    { id: 'metal-aluminum', name: 'Brushed Aluminum', category: 'metal', material: matAluminum, description: 'Satin anodized aluminum' },
    { id: 'metal-dark-steel', name: 'Matte Dark Steel', category: 'metal', material: matDarkSteel, description: 'Dark architectural steel' },
    { id: 'metal-brass', name: 'Polished Brass', category: 'metal', material: matBrass, description: 'Reflective gold brass' },
    { id: 'trim-white', name: 'Painted White', category: 'wood', material: matWhitePainted, description: 'Clean satin painted finish' },
  ];

  for (const def of list) {
    materialRegistry.set(def.id, def);
  }
}

export function getAllMaterials(): MaterialDefinition[] {
  initBuiltinMaterials();
  return Array.from(materialRegistry.values());
}

export function getMaterialsByCategory(category: MaterialCategory | 'all'): MaterialDefinition[] {
  const all = getAllMaterials();
  if (category === 'all') return all;
  return all.filter((item) => item.category === category);
}

export function getMaterialById(id: string): MaterialDefinition | undefined {
  initBuiltinMaterials();
  return materialRegistry.get(id);
}

export function registerCustomMaterial(def: MaterialDefinition): void {
  initBuiltinMaterials();
  materialRegistry.set(def.id, def);
}

/**
 * Creates a custom material from an uploaded image file.
 */
export async function createMaterialFromImageFile(
  file: File,
  options: { roughness?: number; metalness?: number; name?: string } = {},
): Promise<MaterialDefinition> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const texture = new THREE.Texture(img);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.5, 1.5);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: options.roughness ?? 0.6,
          metalness: options.metalness ?? 0.05,
        });

        const id = `custom-${crypto.randomUUID()}`;
        const name = options.name || file.name.replace(/\.[^/.]+$/, '');

        const def: MaterialDefinition = {
          id,
          name,
          category: 'custom',
          material,
          description: `Custom image texture (${file.name})`,
        };

        registerCustomMaterial(def);
        resolve(def);
      };
      img.onerror = () => reject(new Error('Failed to load image texture.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}
