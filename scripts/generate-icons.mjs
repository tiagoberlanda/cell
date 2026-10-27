import { chromium } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../apps/web/public');

// Exact Coordenador animal cell SVG markup
function getSvg({ size, padding = 0, isMaskable = false, rx = 0 }) {
  // Cell coordinate space is 100x100.
  // Center is at (50, 50).
  const innerSize = size - padding * 2;
  const scale = innerSize / 100;
  const offset = padding;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${rx}" fill="#101111"/>
      <g transform="translate(${offset}, ${offset}) scale(${scale})">
        <circle cx="50" cy="50" r="42" fill="#f1f0e9"/>
        <circle cx="50" cy="50" r="36.5" fill="#f7f7f4"/>
        <circle cx="34" cy="62" r="13" fill="#b0b0a8"/>
        <circle cx="31" cy="60" r="5" fill="#797972"/>
        <g transform="rotate(-35 72 66)">
          <ellipse cx="72" cy="66" rx="10" ry="5.5" fill="#797972"/>
          <path d="M65 66q2-3 4 0t4 0t4 0" fill="none" stroke="#fcfcfb" stroke-width="2.2" stroke-linecap="round"/>
        </g>
        <circle cx="70" cy="24" r="3" fill="#b0b0a8"/>
        <circle cx="25" cy="36" r="2.5" fill="#b0b0a8"/>
        <circle cx="54" cy="78" r="2.5" fill="#b0b0a8"/>
        <g transform="translate(55 40) rotate(-22)">
          <rect x="-13.5" y="-10.5" width="8" height="21" rx="4" fill="#101313"/>
          <rect x="5.5" y="-10.5" width="8" height="21" rx="4" fill="#101313"/>
        </g>
      </g>
    </svg>
  `;
}

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage();

  const icons = [
    {
      name: 'icon-192.png',
      size: 192,
      padding: 16,
      rx: 44
    },
    {
      name: 'icon-512.png',
      size: 512,
      padding: 42,
      rx: 116
    },
    {
      name: 'icon-maskable-512.png',
      size: 512,
      padding: 85, // Safe zone for maskable icons (center ~66%)
      rx: 0 // Must be full bleed square
    },
    {
      name: 'apple-touch-icon.png',
      size: 180,
      padding: 15,
      rx: 0 // iOS applies squircle mask automatically
    }
  ];

  for (const icon of icons) {
    const svg = getSvg(icon);
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:transparent;">${svg}</body></html>`);
    const buffer = await page.screenshot({ type: 'png', omitBackground: false });
    const outPath = resolve(publicDir, icon.name);
    await writeFile(outPath, buffer);
    console.log(`Generated ${icon.name} (${icon.size}x${icon.size}) -> ${outPath}`);
  }

  // Also write the master icon.svg with the Coordenador animal cell
  const masterSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" rx="44" fill="#101111"/>
  <g transform="translate(16 16) scale(1.6)">
    <circle cx="50" cy="50" r="42" fill="#f1f0e9"/>
    <circle cx="50" cy="50" r="36.5" fill="#f7f7f4"/>
    <circle cx="34" cy="62" r="13" fill="#b0b0a8"/>
    <circle cx="31" cy="60" r="5" fill="#797972"/>
    <g transform="rotate(-35 72 66)">
      <ellipse cx="72" cy="66" rx="10" ry="5.5" fill="#797972"/>
      <path d="M65 66q2-3 4 0t4 0t4 0" fill="none" stroke="#fcfcfb" stroke-width="2.2" stroke-linecap="round"/>
    </g>
    <circle cx="70" cy="24" r="3" fill="#b0b0a8"/>
    <circle cx="25" cy="36" r="2.5" fill="#b0b0a8"/>
    <circle cx="54" cy="78" r="2.5" fill="#b0b0a8"/>
    <g transform="translate(55 40) rotate(-22)">
      <rect x="-13.5" y="-10.5" width="8" height="21" rx="4" fill="#101313"/>
      <rect x="5.5" y="-10.5" width="8" height="21" rx="4" fill="#101313"/>
    </g>
  </g>
</svg>
`;
  await writeFile(resolve(publicDir, 'icon.svg'), masterSvg.trim());
  console.log('Updated icon.svg');

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
