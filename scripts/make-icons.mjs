// Renders public/icon.svg to the PNG icons the Home Screen needs. Run: node scripts/make-icons.mjs
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

for (const [name, size] of Object.entries(sizes)) {
  await sharp(pub('icon.svg'), { density: 300 }).resize(size, size).png().toFile(pub(name));
  console.log(`${name} ${size}x${size}`);
}
