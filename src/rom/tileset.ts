import {PRG_TILESET_ALTERNATES, PRG_TILESET_ATTRS, PRG_TILESET_TILES,
        PRG_TILE_EFFECTS, TILESET_IDS, TILE_EFFECTS_IDS} from './constants';
import {seq, tuple} from './bytes';

/**
 * A tileset maps each of 256 metatile ids to four CHR tile indices (top-left,
 * top-right, bottom-left, bottom-right) plus a 2-bit palette attribute.
 * Metatiles $00..$1f additionally have a flag-based alternate.
 */
export class Tileset {
  /** Outer index is quadrant (TL, TR, BL, BR); inner is metatile id. */
  tiles: number[][];
  /** Palette attribute (0..3) per metatile. */
  attrs: number[];
  /** Alternate metatile shown when the screen's flag is set (32 entries). */
  alternates: number[];

  constructor(prg: Uint8Array, readonly id: number) {
    this.tiles = seq(4, q => tuple(prg, this.tileBase | q << 8, 256));
    this.attrs = seq(256, i => prg[this.attrBase | i >> 2] >> ((i & 3) << 1) & 3);
    this.alternates = tuple(prg, this.alternatesBase, 32);
  }

  private get map(): number {
    return this.id & 0x3f;
  }

  get tileBase(): number {
    return PRG_TILESET_TILES | this.map << 8;
  }

  get attrBase(): number {
    return PRG_TILESET_ATTRS | this.map << 4;
  }

  get alternatesBase(): number {
    return PRG_TILESET_ALTERNATES | this.map << 3;
  }

  /** The four CHR tile indices making up metatile `id`. */
  quadrants(id: number): [number, number, number, number] {
    return [this.tiles[0][id], this.tiles[1][id],
            this.tiles[2][id], this.tiles[3][id]];
  }

  setQuadrant(id: number, quadrant: number, tile: number) {
    this.tiles[quadrant][id] = tile & 0xff;
  }

  setAttr(id: number, attr: number) {
    this.attrs[id] = attr & 3;
  }

  /** Alternate metatile id, or null if this metatile has none. */
  alternative(id: number): number | null {
    if (id >= 0x20) return null;
    const alt = this.alternates[id];
    return alt !== id ? alt : null;
  }

  /** The TileEffects id paired with this tileset in vanilla. */
  effectsId(): number {
    let index = (this.id >>> 2) & 0xf;
    if (this.id === 0xa8) index = 2;
    if (this.id === 0xac) index--;
    return TILE_EFFECTS_IDS[index] ?? TILE_EFFECTS_IDS[0];
  }

  write(prg: Uint8Array) {
    for (let q = 0; q < 4; q++) {
      prg.set(this.tiles[q], this.tileBase | q << 8);
    }
    for (let i = 0; i < 0x40; i++) {
      const j = i << 2;
      prg[this.attrBase | i] =
          (this.attrs[j] & 3) | (this.attrs[j + 1] & 3) << 2 |
          (this.attrs[j + 2] & 3) << 4 | (this.attrs[j + 3] & 3) << 6;
    }
    prg.set(this.alternates, this.alternatesBase);
  }
}

/** Terrain effect bitfield per metatile id. */
export class TileEffects {
  effects: number[];

  constructor(prg: Uint8Array, readonly id: number) {
    this.effects = tuple(prg, this.base, 256);
  }

  get base(): number {
    return (this.id << 8) & 0x1fff | PRG_TILE_EFFECTS;
  }

  write(prg: Uint8Array) {
    prg.set(this.effects, this.base);
  }
}

export class Tilesets {
  private readonly byId = new Map<number, Tileset>();
  private readonly effectsById = new Map<number, TileEffects>();

  constructor(prg: Uint8Array) {
    for (const id of TILESET_IDS) this.byId.set(id, new Tileset(prg, id));
    for (const id of TILE_EFFECTS_IDS) {
      this.effectsById.set(id, new TileEffects(prg, id));
    }
  }

  get(id: number): Tileset {
    const ts = this.byId.get(id);
    if (ts) return ts;
    // Fall back to the first tileset rather than crashing on odd data.
    return this.byId.get(TILESET_IDS[0])!;
  }

  effects(id: number): TileEffects {
    const fx = this.effectsById.get(id);
    if (fx) return fx;
    return this.effectsById.get(TILE_EFFECTS_IDS[0])!;
  }

  ids(): number[] {
    return [...this.byId.keys()];
  }

  effectsIds(): number[] {
    return [...this.effectsById.keys()];
  }

  write(prg: Uint8Array) {
    for (const ts of this.byId.values()) ts.write(prg);
    for (const fx of this.effectsById.values()) fx.write(prg);
  }
}
