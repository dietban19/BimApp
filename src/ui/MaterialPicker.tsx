import React, { useRef, useState, useId } from 'react';
import * as THREE from 'three';
import {
  getAllMaterials,
  createMaterialFromImageFile,
  type MaterialCategory,
  type MaterialDefinition,
} from '../materials/materialLibrary';
import { generateMaterialSpherePreview } from '../materials/spherePreview';

interface MaterialPickerProps {
  currentMaterialId?: string | null;
  allowedCategories?: MaterialCategory[];
  onSelectMaterial: (material: THREE.Material, materialId: string) => void;
  onPreviewMaterial?: (material: THREE.Material | null) => void;
  title?: string;
}

export const MaterialPicker: React.FC<MaterialPickerProps> = ({
  currentMaterialId,
  allowedCategories,
  onSelectMaterial,
  onPreviewMaterial,
  title = 'Select Material',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [materials, setMaterials] = useState<MaterialDefinition[]>(() => getAllMaterials());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const customDef = await createMaterialFromImageFile(file);
      setMaterials(getAllMaterials());
      onSelectMaterial(customDef.material, customDef.id);
    } catch (err) {
      console.error('Failed to load custom material file', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredMaterials = materials.filter((item) => {
    if (allowedCategories && allowedCategories.length > 0) {
      if (!allowedCategories.includes(item.category) && item.category !== 'custom') {
        return false;
      }
    }
    if (selectedCategory === 'all') return true;
    return item.category === selectedCategory;
  });

  // Collect available categories
  const categories: string[] = ['all'];
  materials.forEach((m) => {
    if (!allowedCategories || allowedCategories.includes(m.category) || m.category === 'custom') {
      if (!categories.includes(m.category)) {
        categories.push(m.category);
      }
    }
  });

  return (
    <div className="ui-material-picker">
      <div className="ui-material-picker-header">
        <span className="ui-picker-title">{title}</span>
        <button
          type="button"
          className="ui-btn-upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Import texture image from your computer"
        >
          {uploading ? '⏳ Loading...' : '📁 Add From File'}
        </button>
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/jpg"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </div>

      {categories.length > 2 && (
        <div className="ui-category-pills">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`ui-category-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="ui-material-grid">
        {filteredMaterials.map((item) => {
          const previewUrl = generateMaterialSpherePreview(item.id, item.material);
          const isSelected = currentMaterialId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`ui-material-card ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectMaterial(item.material, item.id)}
              onMouseEnter={() => onPreviewMaterial?.(item.material)}
              onMouseLeave={() => onPreviewMaterial?.(null)}
              title={item.description || item.name}
            >
              <div className="ui-material-sphere-wrapper">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={item.name}
                    className="ui-material-sphere-img"
                  />
                ) : (
                  <div className="ui-material-sphere-placeholder" />
                )}
                {isSelected && <span className="ui-material-check">✓</span>}
              </div>
              <span className="ui-material-name">{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
