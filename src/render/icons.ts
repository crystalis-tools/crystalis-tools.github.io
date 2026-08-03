import {ITEM_ICON_TILE_BASE} from '../rom/constants';
import type {Rom} from '../rom/rom';

/** Greyscale fill for pattern colour indices 1..3 (0 is transparent). */
const GREY_SHADES = ['', '#888888', '#bbbbbb', '#eeeeee'];

/** The 9 pattern ids (see `Patterns`) making up an item's 3x3 menu icon. */
export function iconTileIds(iconByte: number): number[] {
  const base = ITEM_ICON_TILE_BASE + ((iconByte - 0x80) & 0xff);
  return Array.from({length: 9}, (_, i) => base + i);
}

/** Draws a 24x24 (times `scale`) item icon at the canvas origin, in greyscale. */
export function drawItemIcon(c2d: CanvasRenderingContext2D, rom: Rom,
                             iconByte: number, scale = 1) {
  const tiles = iconTileIds(iconByte);
  for (let quad = 0; quad < 9; quad++) {
    const pattern = rom.patterns.get(tiles[quad]);
    const ox = (quad % 3) * 8 * scale;
    const oy = Math.floor(quad / 3) * 8 * scale;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const z = pattern.pixelAt(y, x);
        if (!z) continue;
        c2d.fillStyle = GREY_SHADES[z];
        c2d.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }
}
