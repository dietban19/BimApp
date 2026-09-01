import * as THREE from 'three';

/**
 * Generates procedural textures using HTML5 Canvas.
 * This guarantees photorealistic PBR maps without relying on external network requests.
 */

const textureCache = new Map<string, THREE.CanvasTexture>();

function createNoise(ctx: CanvasRenderingContext2D, width: number, height: number, opacity: number): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * opacity * 255;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);
}

export function getPlasterTexture(): THREE.CanvasTexture {
  const key = 'plaster_diffuse';
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f1f1ee';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle plaster stipples
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random() * 2 + 0.5;
    const shade = Math.random() > 0.5 ? 250 : 230;
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade - 5}, 0.3)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  createNoise(ctx, 512, 512, 0.04);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getConcreteTexture(): THREE.CanvasTexture {
  const key = 'concrete_diffuse';
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#9e9e9e';
  ctx.fillRect(0, 0, 512, 512);

  // Concrete clouds and mottled patches
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = Math.random() * 120 + 40;
    const gradient = ctx.createRadialGradient(x, y, 5, x, y, radius);
    const val = Math.floor(Math.random() * 50 + 130);
    gradient.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.25)`);
    gradient.addColorStop(1, 'rgba(150, 150, 150, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Micro pinholes
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = 'rgba(70, 70, 70, 0.4)';
    ctx.fillRect(x, y, Math.random() * 2 + 1, Math.random() * 2 + 1);
  }

  createNoise(ctx, 512, 512, 0.08);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getBrickTexture(): THREE.CanvasTexture {
  const key = 'brick_diffuse';
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Mortar background
  ctx.fillStyle = '#dcd5ca';
  ctx.fillRect(0, 0, 512, 512);

  const brickW = 64;
  const brickH = 26;
  const mortar = 4;
  const rows = Math.ceil(512 / (brickH + mortar));
  const cols = Math.ceil(512 / (brickW + mortar)) + 1;

  for (let r = 0; r < rows; r++) {
    const offsetX = (r % 2) * (brickW / 2 + mortar / 2);
    for (let c = -1; c < cols; c++) {
      const x = c * (brickW + mortar) + offsetX;
      const y = r * (brickH + mortar);

      // Brick color variations
      const red = Math.floor(160 + Math.random() * 40);
      const green = Math.floor(55 + Math.random() * 25);
      const blue = Math.floor(40 + Math.random() * 20);

      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(x, y, brickW, brickH);

      // Subtle brick edge highlight and texture
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(x, y + brickH - 2, brickW, 2);
      ctx.fillRect(x + brickW - 2, y, 2, brickH);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x, y, brickW, 2);
      ctx.fillRect(x, y, 2, brickH);
    }
  }

  createNoise(ctx, 512, 512, 0.07);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getWoodTexture(isDark = false): THREE.CanvasTexture {
  const key = `wood_diffuse_${isDark ? 'dark' : 'light'}`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const baseColor = isDark ? '#4a2e1b' : '#c8965d';
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 512);

  // Planks
  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    // Plank line
    ctx.fillStyle = 'rgba(20, 10, 5, 0.35)';
    ctx.fillRect(0, y, 512, 2);

    // Wood grain lines along each plank
    for (let i = 0; i < 35; i++) {
      const lineY = y + Math.random() * plankH;
      const alpha = Math.random() * 0.2 + 0.05;
      ctx.strokeStyle = isDark
        ? `rgba(20, 10, 5, ${alpha})`
        : `rgba(110, 60, 20, ${alpha})`;
      ctx.lineWidth = Math.random() * 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.bezierCurveTo(
        150,
        lineY + (Math.random() - 0.5) * 6,
        350,
        lineY + (Math.random() - 0.5) * 6,
        512,
        lineY,
      );
      ctx.stroke();
    }
  }

  createNoise(ctx, 512, 512, 0.05);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getTileTexture(): THREE.CanvasTexture {
  const key = 'tile_diffuse';
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#cbd5e1'; // Grout color
  ctx.fillRect(0, 0, 512, 512);

  const tileSize = 64;
  const grout = 3;

  for (let x = 0; x < 512; x += tileSize) {
    for (let y = 0; y < 512; y += tileSize) {
      const shade = 245 + Math.floor(Math.random() * 10);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(x + grout, y + grout, tileSize - grout * 2, tileSize - grout * 2);

      // Bevel highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(x + grout, y + grout, tileSize - grout * 2, 2);
      ctx.fillRect(x + grout, y + grout, 2, tileSize - grout * 2);

      // Bevel shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(x + grout, y + tileSize - grout - 2, tileSize - grout * 2, 2);
      ctx.fillRect(x + tileSize - grout - 2, y + grout, 2, tileSize - grout * 2);
    }
  }

  createNoise(ctx, 512, 512, 0.02);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getMarbleTexture(): THREE.CanvasTexture {
  const key = 'marble_diffuse';
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 512);

  // Marble veining
  for (let v = 0; v < 6; v++) {
    let startX = Math.random() * 512;
    let startY = 0;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY);

    while (startY < 512) {
      const nextX = startX + (Math.random() - 0.48) * 50;
      const nextY = startY + Math.random() * 40 + 20;
      ctx.lineTo(nextX, nextY);
      startX = nextX;
      startY = nextY;
    }
    ctx.stroke();
  }

  createNoise(ctx, 512, 512, 0.03);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function getSlateTexture(): THREE.CanvasTexture {
  const key = 'slate_diffuse';
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#262d38';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = Math.random() * 200 + 50;
    const h = Math.random() * 8 + 2;
    ctx.fillStyle = 'rgba(60, 75, 95, 0.3)';
    ctx.fillRect(x, y, w, h);
  }

  createNoise(ctx, 512, 512, 0.08);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function disposeProceduralTextures(): void {
  for (const texture of textureCache.values()) {
    texture.dispose();
  }
  textureCache.clear();
}
