/**
 * Render locations to PNG with the real renderer, using a headless canvas.
 *
 * This exercises graphics.ts / sprites.ts / maprenderer.ts exactly as the
 * browser does - the only substitution is `document.createElement('canvas')`.
 *
 * Usage: npm run rendermap [locationId...]   (hex ids, default: a sampler)
 */

import {createCanvas} from '@napi-rs/canvas';
import {writeFileSync, mkdirSync} from 'node:fs';
import {hex} from '../src/rom/bytes';
import {Rom} from '../src/rom/rom';

// Install a DOM shim before importing anything that touches `document`.
(globalThis as any).document = {
  createElement(tag: string) {
    if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
    // @napi-rs/canvas needs its size at construction, so start at 1x1 and let
    // the width/height setters resize it, mirroring the DOM.
    return createCanvas(1, 1);
  },
};

const {Graphics} = await import('../src/render/graphics');
const {DEFAULT_OVERLAYS, renderLocation} = await import('../src/render/maprenderer');

const romPath = 'research/Crystalis (USA).nes';
const rom = Rom.load(new Uint8Array((await import('node:fs')).readFileSync(romPath)),
                     romPath);
const graphics = new Graphics(rom);

const args = process.argv.slice(2).filter(a => /^[0-9a-f]{1,2}$/i.test(a));
const ids = args.length ? args.map(a => parseInt(a, 16)) :
    [0x02, 0x03, 0x1a, 0x28, 0x40];

const outDir = 'node_modules/.tmp/render';
mkdirSync(outDir, {recursive: true});

for (const id of ids) {
  const loc = rom.location(id);
  if (!loc.used) {
    console.log(`$${hex(id)} unused, skipping`);
    continue;
  }
  const canvas = createCanvas(loc.pxWidth, loc.pxHeight);
  renderLocation(graphics, loc, canvas as any,
                 {...DEFAULT_OVERLAYS, screenGrid: false}, false, 0);

  const png = canvas.toBuffer('image/png');
  const file = `${outDir}/loc-${hex(id)}-${loc.name || 'unnamed'}.png`;
  writeFileSync(file, png);

  // A blank render is the classic silent failure, so measure the output.
  const pixels = canvas.getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4) {
    colors.add(pixels[i] << 16 | pixels[i + 1] << 8 | pixels[i + 2]);
  }
  const sprites = loc.spawns.filter(s => s.used).length;
  console.log(`$${hex(id)} ${(loc.name || '?').padEnd(22)} ` +
              `${String(loc.pxWidth).padStart(4)}x${String(loc.pxHeight).padEnd(4)} ` +
              `${String(colors.size).padStart(3)} colours, ` +
              `${String(sprites).padStart(2)} spawns  -> ${file}`);
  if (colors.size < 4) {
    console.error(`  WARNING: only ${colors.size} distinct colours - ` +
                  `render looks blank`);
    process.exitCode = 1;
  }
}
