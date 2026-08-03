import {reverseBits, seq, tuple} from './bytes';

export const enum Flip {
  NONE = 0x00,
  HORIZONTAL = 0x40,
  VERTICAL = 0x80,
}

/**
 * One 8x8 CHR tile in 2bpp planar format: 8 bytes of low bitplane followed by
 * 8 bytes of high bitplane.
 */
export class Pattern {
  pixels: number[];

  constructor(readonly id: number, pixels?: number[]) {
    this.pixels = pixels ?? new Array(16).fill(0);
  }

  static from(chr: Uint8Array, id: number): Pattern {
    return new Pattern(id, tuple(chr, id << 4, 16));
  }

  /** Colour index (0..3) at row `y`, column `x`, both 0..7. */
  pixelAt(y: number, x: number): number {
    return (this.pixels[y | 8] >> (7 - x) & 1) << 1 | (this.pixels[y] >> (7 - x) & 1);
  }

  flipH(): Pattern {
    return new Pattern(-1, this.pixels.map(reverseBits));
  }

  flipV(): Pattern {
    return new Pattern(-1, seq(16, y => this.pixels[(y & 8) | (~y & 7)]));
  }

  flip(type: number): Pattern {
    let p: Pattern = this;
    if (type & Flip.HORIZONTAL) p = p.flipH();
    if (type & Flip.VERTICAL) p = p.flipV();
    return p;
  }
}

export class Patterns {
  private readonly all: Pattern[];

  constructor(chr: Uint8Array) {
    this.all = seq(chr.length >> 4, i => Pattern.from(chr, i));
  }

  get count(): number {
    return this.all.length;
  }

  get(id: number): Pattern {
    return this.all[id] ?? new Pattern(id);
  }

  set(id: number, pixels: number[]) {
    this.all[id] = new Pattern(id, pixels);
  }

  write(chr: Uint8Array) {
    for (const p of this.all) {
      if (p.id < 0) continue;
      chr.set(p.pixels, p.id << 4);
    }
  }
}
