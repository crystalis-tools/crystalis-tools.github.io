import {PRG_METASPRITES, PRG_METASPRITE_MIN, PRG_METASPRITE_WINDOW}
    from './constants';
import {readLE16, seq, tuple} from './bytes';

/** One hardware sprite within a metasprite: `[dx, dy, attributes, tile]`. */
export type Sprite = readonly [number, number, number, number];

/** Sentinel in the `dx` slot marking the end of a frame's sprite list. */
export const SPRITE_TERMINATOR = 0x80;

/**
 * A composed sprite: a list of 8x8 CHR tiles with per-tile offsets, palette
 * and flip attributes, optionally animated over several frames.
 *
 * Some entries are "mirrored": their data is a single `$ff` followed by a
 * pointer to another metasprite, which is then drawn horizontally flipped.
 */
export class Metasprite {
  readonly pointer: number;
  readonly base: number;
  readonly used: boolean;
  /** Id of the metasprite this one mirrors, or null if it stands alone. */
  readonly mirrored: number | null = null;
  readonly size: number = 0;
  readonly frameMask: number = 0;
  readonly frames: number = 0;
  /** `sprites[frame]` is the sprite list for that animation frame. */
  readonly sprites: Sprite[][] = [];

  constructor(prg: Uint8Array, readonly id: number,
              mirrorLookup?: (target: number) => number | null) {
    this.pointer = PRG_METASPRITES + (id << 1);
    this.base = readLE16(prg, this.pointer) + PRG_METASPRITE_WINDOW;
    this.used = this.base >= PRG_METASPRITE_MIN;

    if (!this.used) return;

    if (prg[this.base] === 0xff) {
      const target = readLE16(prg, this.base + 1);
      this.mirrored = mirrorLookup ? mirrorLookup(target) : null;
      return;
    }

    this.size = prg[this.base];
    this.frameMask = prg[this.base + 1];
    this.frames = this.frameMask + 1;
    this.sprites = seq(this.frames, f => {
      const start = this.base + 2 + f * 4 * this.size;
      const sprites: Sprite[] = [];
      for (let i = 0; i < this.size; i++) {
        const offset = start + 4 * i;
        // A frame may stop early; the last frame needs only one terminator row.
        if (prg[offset] === SPRITE_TERMINATOR && f === this.frames - 1) {
          sprites.push([0x80, 0x80, 0x80, 0x80]);
          break;
        }
        sprites.push(tuple(prg, offset, 4) as unknown as Sprite);
      }
      return sprites;
    });
  }

  /** Sprite list for an animation frame, following mirrors. */
  frame(index: number): Sprite[] {
    if (!this.frames) return [];
    return this.sprites[index & this.frameMask] ?? this.sprites[0] ?? [];
  }
}

export class Metasprites {
  private readonly all: Metasprite[] = [];

  constructor(prg: Uint8Array) {
    // Mirrored entries point at another entry's data address, so build an
    // address -> id index first.
    const byAddress = new Map<number, number>();
    for (let id = 0; id < 0x100; id++) {
      const address = readLE16(prg, PRG_METASPRITES + (id << 1));
      if (!byAddress.has(address)) byAddress.set(address, id);
    }
    for (let id = 0; id < 0x100; id++) {
      this.all.push(
          new Metasprite(prg, id, target => byAddress.get(target) ?? null));
    }
  }

  get(id: number): Metasprite | null {
    const ms = this.all[id & 0xff];
    return ms?.used ? ms : null;
  }

  /**
   * Resolve a metasprite to the entry that actually holds sprite data, plus
   * whether the caller must flip it horizontally.
   */
  resolve(id: number): {metasprite: Metasprite, mirrored: boolean} | null {
    const ms = this.get(id);
    if (!ms) return null;
    if (ms.mirrored == null) return {metasprite: ms, mirrored: false};
    const target = this.get(ms.mirrored);
    if (!target || target.mirrored != null) return null;
    return {metasprite: target, mirrored: true};
  }
}
