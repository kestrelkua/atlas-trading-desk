// Renders public/icons/icon.svg into the PNG sizes phones and browsers ask for.
// Run with: npm run build-icons
import sharp from 'sharp';

const src = new URL('../public/icons/icon.svg', import.meta.url).pathname;
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180, 'favicon-32.png': 32 };

for (const [name, size] of Object.entries(sizes)) {
  await sharp(src, { density: 384 }).resize(size).png().toFile(out(name));
  console.log(`${name} (${size}px)`);
}
