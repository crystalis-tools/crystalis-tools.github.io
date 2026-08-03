import {PRG_PALETTES} from './constants';
import {tuple} from './bytes';

/**
 * A 4-colour background palette.  Palettes are stored in a swizzled layout:
 * `base = (id & 3) << 2 | (id & 0xfc) << 6 | 0x40f0`.
 */
export class Palette {
  readonly base: number;
  colors: number[];

  constructor(prg: Uint8Array, readonly id: number) {
    this.base = (id & 3) << 2 | (id & 0xfc) << 6 | PRG_PALETTES;
    this.colors = tuple(prg, this.base, 4);
  }

  /** NES colour index (0..63) for entry `c` of this palette. */
  color(c: number): number {
    return this.colors[c] & 0x3f;
  }

  setColor(c: number, value: number) {
    this.colors[c] = value & 0x3f;
  }

  write(prg: Uint8Array) {
    for (let i = 0; i < 4; i++) prg[this.base + i] = this.colors[i];
  }
}

export class Palettes {
  private readonly all: Palette[] = [];

  constructor(prg: Uint8Array) {
    for (let i = 0; i < 0x100; i++) this.all.push(new Palette(prg, i));
  }

  get(id: number): Palette {
    return this.all[id & 0xff];
  }

  write(prg: Uint8Array) {
    for (const p of this.all) p.write(prg);
  }
}
