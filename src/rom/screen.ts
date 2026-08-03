import {NUM_SCREENS, SCREEN_HEIGHT, SCREEN_WIDTH} from './constants';
import {tuple} from './bytes';

/**
 * A screen is a 16x15 grid of metatile ids.  Screens $000..$0ff live at
 * `id << 8` in PRG; the three extended-plane screens $100..$102 are relocated
 * into segment $0a at `(0x40 + id) << 8`, where only the first $c0 bytes are
 * meaningful (the last two rows sit behind the HUD).
 */
export class Screen {
  tiles: number[];

  constructor(readonly id: number, tiles?: number[]) {
    this.tiles = tiles ?? new Array(SCREEN_WIDTH * SCREEN_HEIGHT).fill(0);
  }

  static base(id: number): number {
    return (id > 0xff ? 0x40 + id : id) << 8;
  }

  /** Screens above $ff only store the first $c0 bytes. */
  static storedLength(id: number): number {
    return id > 0xff ? 0xc0 : 0xf0;
  }

  static from(prg: Uint8Array, id: number): Screen {
    const tiles = tuple(prg, Screen.base(id), 0xf0);
    if (id > 0xff) tiles.fill(0, 0xc0);
    return new Screen(id, tiles);
  }

  get(x: number, y: number): number {
    return this.tiles[y << 4 | x];
  }

  set(x: number, y: number, metatile: number) {
    this.tiles[y << 4 | x] = metatile & 0xff;
  }

  clone(newId = this.id): Screen {
    return new Screen(newId, [...this.tiles]);
  }

  write(prg: Uint8Array) {
    const len = Screen.storedLength(this.id);
    prg.set(this.tiles.slice(0, len), Screen.base(this.id));
  }
}

export class Screens {
  private readonly all: Screen[] = [];

  constructor(prg: Uint8Array) {
    for (let i = 0; i < NUM_SCREENS; i++) this.all.push(Screen.from(prg, i));
  }

  get count(): number {
    return this.all.length;
  }

  get(id: number): Screen {
    return this.all[id] ?? (this.all[id] = new Screen(id));
  }

  write(prg: Uint8Array) {
    for (const s of this.all) s?.write(prg);
  }
}
