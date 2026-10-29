// Renders the app icon (a tuner gauge with the needle on centre) to PNGs in public/icons.
// Dependency-free: shapes are rasterised with 4×4 supersampling and encoded with node:zlib.
// Run with: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [11, 15, 20];
const ARC = [59, 70, 86];
const GREEN = [52, 211, 153];
const PIVOT = [232, 237, 243];

const SWEEP = (60 * Math.PI) / 180;
const ZONE = (12 * Math.PI) / 180;

/** Colour at a point in the unit square, before background; null = background. `scale` grows the art about the centre. */
function shade(x, y, scale) {
  const cx = 0.5;
  const cy = 0.5 + 0.14 * scale; // pivot sits below centre so the whole gauge is visually centred
  const dx = (x - cx) / scale;
  const dy = (y - cy) / scale;
  const r = Math.hypot(dx, dy);
  const angle = Math.atan2(dx, -dy); // 0 = up, clockwise positive

  if (r <= 0.055) return PIVOT;
  // Needle: capsule from the pivot straight up.
  if (Math.abs(dx) <= 0.022 && dy <= 0 && dy >= -0.29) return GREEN;
  if (Math.hypot(dx, dy + 0.29) <= 0.022) return GREEN;
  // Arc with round caps.
  const R = 0.31;
  const half = 0.028;
  const onArc = Math.abs(r - R) <= half && Math.abs(angle) <= SWEEP;
  const capL = Math.hypot(dx - R * Math.sin(-SWEEP), dy + R * Math.cos(-SWEEP)) <= half;
  const capR = Math.hypot(dx - R * Math.sin(SWEEP), dy + R * Math.cos(SWEEP)) <= half;
  if (onArc || capL || capR) return Math.abs(angle) <= ZONE && onArc ? GREEN : ARC;
  return null;
}

function render(size, scale) {
  const SS = 4;
  const pixels = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, scale) ?? BG;
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (py * size + px) * 3;
      pixels[i] = Math.round(r / (SS * SS));
      pixels[i + 1] = Math.round(g / (SS * SS));
      pixels[i + 2] = Math.round(b / (SS * SS));
    }
  }
  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Opaque 8-bit RGB PNG (iOS wants no transparency in touch icons). */
function encodePng(size, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Maskable icons must keep content inside the central 80% circle, so their art is drawn smaller.
const icons = [
  { file: 'apple-touch-icon.png', size: 180, scale: 1.35 },
  { file: 'icon-192.png', size: 192, scale: 1.35 },
  { file: 'icon-512.png', size: 512, scale: 1.35 },
  { file: 'icon-maskable-512.png', size: 512, scale: 1.2 },
];

mkdirSync(outDir, { recursive: true });
for (const { file, size, scale } of icons) {
  writeFileSync(join(outDir, file), encodePng(size, render(size, scale)));
  console.log(`wrote public/icons/${file}`);
}
