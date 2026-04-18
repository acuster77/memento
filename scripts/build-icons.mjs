import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'assets', 'icon.svg');
const outDir = join(root, 'public', 'icons');
const sizes = [16, 24, 32, 48, 128];

await mkdir(outDir, { recursive: true });
const svg = await readFile(src);
await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 300 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(join(outDir, `${size}.png`)),
  ),
);
console.log(`Wrote ${sizes.length} icons to ${outDir}`);
