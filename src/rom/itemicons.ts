import {NUM_ITEMS, PRG_ITEM_ICON_TILES} from './constants';

/**
 * Which 3x3 CHR tile block (see `render/icons.ts`) each item's menu icon
 * uses, read from the ROM's per-item icon table.
 */
export class ItemIcons {
  private readonly tiles: number[] = [];

  constructor(prg: Uint8Array) {
    for (let id = 0; id < NUM_ITEMS; id++) {
      this.tiles.push(prg[PRG_ITEM_ICON_TILES + id]);
    }
  }

  get(id: number): number {
    return this.tiles[id] ?? 0x80;
  }

  set(id: number, value: number) {
    this.tiles[id] = value & 0xff;
  }

  write(prg: Uint8Array) {
    for (let id = 0; id < this.tiles.length; id++) {
      prg[PRG_ITEM_ICON_TILES + id] = this.tiles[id];
    }
  }
}
