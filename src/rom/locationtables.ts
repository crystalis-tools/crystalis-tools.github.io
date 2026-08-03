import {SCREEN_PX_HEIGHT, SCREEN_PX_WIDTH} from './constants';
import {hex} from './bytes';

/**
 * Fixed-size records embedded in a location's MapData/NpcData.  Each wraps a
 * mutable byte array so edits write straight back through to serialization.
 */
abstract class Record {
  constructor(readonly data: number[]) {}

  clone(): this {
    return new (this.constructor as new (d: number[]) => this)([...this.data]);
  }

  hex(): string {
    return this.data.map(b => hex(b)).join(' ');
  }
}

/** Convert an 8-bit `yx` screen-tile coordinate to a pixel offset. */
export function tileYToPixel(yt: number): number {
  return (yt >> 4) * SCREEN_PX_HEIGHT + (yt & 0xf) * 16;
}

export function tileXToPixel(xt: number): number {
  return (xt >> 4) * SCREEN_PX_WIDTH + (xt & 0xf) * 16;
}

/** Where the player appears when entering a location. */
export class Entrance extends Record {
  static readonly size = 4;

  /** Full x in pixels: screen column * 256 + offset. */
  get x(): number { return this.data[0] | this.data[1] << 8; }
  set x(v: number) { this.data[0] = v & 0xff; this.data[1] = v >>> 8 & 0xff; }

  /** Full y in pixels: screen row * 256 + offset (screens are 240px tall). */
  get y(): number { return this.data[2] | this.data[3] << 8; }
  set y(v: number) { this.data[2] = v & 0xff; this.data[3] = v >>> 8 & 0xff; }

  get screenX(): number { return this.data[1] & 0x0f; }
  get screenY(): number { return this.data[3] & 0x0f; }

  /** Pixel position on the composed map canvas. */
  get px(): number { return this.screenX * SCREEN_PX_WIDTH + (this.data[0] & 0xff); }
  get py(): number { return this.screenY * SCREEN_PX_HEIGHT + (this.data[2] & 0xff); }

  /** Entrances are disabled by pushing x out of range. */
  get used(): boolean { return this.data[1] < 0x08; }

  static create(): Entrance { return new Entrance([0, 0, 0, 0]); }

  override toString(): string {
    return `Entrance (${this.px}, ${this.py})`;
  }
}

/** A tile that warps the player to another location. */
export class Exit extends Record {
  static readonly size = 4;

  /** x in screen-tiles: high nibble is the screen column. */
  get xt(): number { return this.data[0]; }
  set xt(v: number) { this.data[0] = v & 0xff; }

  get yt(): number { return this.data[1]; }
  set yt(v: number) { this.data[1] = v & 0xff; }

  get dest(): number { return this.data[2]; }
  set dest(v: number) { this.data[2] = v & 0xff; }

  get entrance(): number { return this.data[3]; }
  set entrance(v: number) { this.data[3] = v & 0xff; }

  get px(): number { return tileXToPixel(this.data[0]); }
  get py(): number { return tileYToPixel(this.data[1]); }

  get seamless(): boolean { return Boolean(this.data[3] & 0x20); }

  static create(): Exit { return new Exit([0, 0, 0, 0]); }

  override toString(): string {
    return `Exit -> $${hex(this.dest)}:${this.entrance}`;
  }
}

/** Associates a screen with a game flag that swaps its alternate metatiles. */
export class Flag extends Record {
  static readonly size = 2;

  get flag(): number { return this.data[0] | 0x200; }
  set flag(v: number) { this.data[0] = v & 0xff; }

  get screenX(): number { return this.data[1] & 0x07; }
  set screenX(v: number) { this.data[1] = this.data[1] & 0xf0 | v & 0x07; }

  get screenY(): number { return this.data[1] >>> 4 & 0x0f; }
  set screenY(v: number) { this.data[1] = this.data[1] & 0x0f | (v & 0x0f) << 4; }

  get screen(): number { return this.data[1]; }

  static create(): Flag { return new Flag([0, 0]); }

  override toString(): string {
    return `Flag $${hex(this.flag, 3)} @ (${this.screenX}, ${this.screenY})`;
  }
}

/** A hole that drops the player into another location. */
export class Pit extends Record {
  static readonly size = 4;

  get dest(): number { return this.data[0]; }
  set dest(v: number) { this.data[0] = v & 0xff; }

  get fromXs(): number { return this.data[1] >>> 4 & 0x07; }
  set fromXs(v: number) { this.data[1] = this.data[1] & 0x8f | (v & 0x07) << 4; }

  get toXs(): number { return this.data[1] & 0x07; }
  set toXs(v: number) { this.data[1] = this.data[1] & 0xf8 | v & 0x07; }

  get fromYs(): number { return this.data[3] >>> 4 & 0x0f; }
  set fromYs(v: number) { this.data[3] = this.data[3] & 0x0f | (v & 0x0f) << 4; }

  get toYs(): number { return this.data[3] & 0x0f; }
  set toYs(v: number) { this.data[3] = this.data[3] & 0xf0 | v & 0x0f; }

  static create(): Pit { return new Pit([0, 0, 0, 0]); }

  override toString(): string {
    return `Pit (${this.fromXs}, ${this.fromYs}) -> $${hex(this.dest)}`;
  }
}

export const enum SpawnType {
  MONSTER = 0,
  NPC = 1,
  CHEST_OR_TRIGGER = 2,
  WALL = 3,
  GENERIC = 4,
}

/** An object placed in a location: monster, NPC, chest, trigger or wall. */
export class Spawn extends Record {
  static readonly size = 4;

  /** y in screen-tiles. */
  get yt(): number { return this.data[0]; }
  set yt(v: number) { this.data[0] = v & 0xff; }

  /** x in screen-tiles (7 bits; bit 7 of byte 1 is the timed flag). */
  get xt(): number { return this.data[1] & 0x7f; }
  set xt(v: number) { this.data[1] = this.data[1] & 0x80 | v & 0x7f; }

  get timed(): boolean { return Boolean(this.data[1] & 0x80); }
  set timed(v: boolean) {
    this.data[1] = v ? this.data[1] | 0x80 : this.data[1] & 0x7f;
  }

  get type(): number { return this.data[2] & 0x07; }
  set type(v: number) { this.data[2] = this.data[2] & 0xf8 | v & 0x07; }

  get id(): number { return this.data[3]; }
  set id(v: number) { this.data[3] = v & 0xff; }

  /** Half-tile x nudge, stored in bit 6 of byte 2. */
  get halfTile(): boolean { return Boolean(this.data[2] & 0x40); }
  set halfTile(v: boolean) {
    this.data[2] = v ? this.data[2] | 0x40 : this.data[2] & ~0x40 & 0xff;
  }

  /** Pattern bank shift (0 or 1). */
  get patternBank(): number { return this.data[2] >>> 7; }
  set patternBank(v: number) {
    this.data[2] = v ? this.data[2] | 0x80 : this.data[2] & 0x7f;
  }

  get px(): number { return tileXToPixel(this.xt) + (this.halfTile ? 8 : 0); }
  get py(): number { return tileYToPixel(this.yt); }

  /** Inactive spawns are marked with $fe in byte 0. */
  get used(): boolean { return this.data[0] !== 0xfe; }
  set used(v: boolean) { this.data[0] = v ? this.data[0] & 0xfd : 0xfe; }

  /** Monster object ids are stored shifted down by $50. */
  get monsterId(): number { return (this.id + 0x50) & 0xff; }
  set monsterId(v: number) { this.id = (v - 0x50) & 0xff; }

  /** Trigger ids are stored with $80 set. */
  get triggerId(): number { return this.id & 0x7f; }
  set triggerId(v: number) { this.id = (v & 0x7f) | 0x80; }

  isMonster(): boolean { return this.type === SpawnType.MONSTER; }
  isNpc(): boolean { return this.type === SpawnType.NPC && this.id < 0xc0; }
  isBoss(): boolean { return this.type === SpawnType.NPC && this.id >= 0xc0; }
  isChest(): boolean {
    return this.type === SpawnType.CHEST_OR_TRIGGER && this.id < 0x80;
  }
  isTrigger(): boolean {
    return this.type === SpawnType.CHEST_OR_TRIGGER && this.id >= 0x80;
  }
  isWall(): boolean {
    return this.type === SpawnType.WALL &&
        (this.id < 4 || Boolean(this.data[2] & 0x20));
  }

  /** Human-readable category, used for inspector labels. */
  kind(): string {
    if (this.isMonster()) return 'Enemy';
    if (this.isBoss()) return 'Boss';
    if (this.isNpc()) return 'NPC';
    if (this.isChest()) return 'Chest';
    if (this.isTrigger()) return 'Trigger';
    if (this.isWall()) return 'Wall';
    if (this.type === SpawnType.GENERIC) return 'Generic';
    return `Type ${this.type}`;
  }

  static create(): Spawn { return new Spawn([0, 0, 0, 0]); }

  override toString(): string {
    return `${this.kind()} $${hex(this.id)} @ (${this.xt}, ${this.yt})`;
  }
}
