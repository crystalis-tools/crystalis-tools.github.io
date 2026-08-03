import {FIRST_ARMOR_ID, FIRST_SHIELD_ID, LAST_ARMOR_ID, LAST_SHIELD_ID,
        NUM_ITEMS, PRG_ARMOR_DEFENSE, PRG_ITEM_DATA,
        PRG_SHIELD_DEFENSE} from './constants';
import {tuple} from './bytes';

/** Per-item flag byte and armor/shield defense tables. */
export class ItemStats {
  /** One flag byte per item id: bit7 solid bg, bit6 unique, bit5 worn,
   *  bits0-1 menu icon palette. */
  private readonly flags: number[];
  /** Index 0 unused; indices 1-8 are shield ids $0d-$14's defense. */
  readonly shieldDefense: number[];
  /** Index 0 unused; indices 1-8 are armor ids $15-$1c's defense. */
  readonly armorDefense: number[];

  constructor(prg: Uint8Array) {
    this.flags = tuple(prg, PRG_ITEM_DATA, NUM_ITEMS);
    this.shieldDefense = tuple(prg, PRG_SHIELD_DEFENSE, 9);
    this.armorDefense = tuple(prg, PRG_ARMOR_DEFENSE, 9);
  }

  isShield(id: number): boolean { return id >= FIRST_SHIELD_ID && id <= LAST_SHIELD_ID; }
  isArmor(id: number): boolean { return id >= FIRST_ARMOR_ID && id <= LAST_ARMOR_ID; }

  /** Defense value for a shield or armor item, or null for anything else. */
  defense(id: number): number | null {
    if (this.isShield(id)) return this.shieldDefense[id - (FIRST_SHIELD_ID - 1)];
    if (this.isArmor(id)) return this.armorDefense[id - (FIRST_ARMOR_ID - 1)];
    return null;
  }

  setDefense(id: number, value: number) {
    if (this.isShield(id)) this.shieldDefense[id - (FIRST_SHIELD_ID - 1)] = value & 0xff;
    else if (this.isArmor(id)) this.armorDefense[id - (FIRST_ARMOR_ID - 1)] = value & 0xff;
    else throw new Error(`Item $${id.toString(16)} has no defense value.`);
  }

  /** Menu icon palette, 0-3: real colour is `SPRITE_PALETTE_BASE + palette`. */
  palette(id: number): number { return this.flags[id] & 3; }
  setPalette(id: number, p: number) {
    this.flags[id] = (this.flags[id] & ~3) | (p & 3);
  }

  /** Cannot be dropped or sold. */
  unique(id: number): boolean { return !!(this.flags[id] & 0x40); }
  setUnique(id: number, v: boolean) {
    this.flags[id] = (this.flags[id] & ~0x40) | (v ? 0x40 : 0);
  }

  /** Worn item: sword/armor/orb/ring/magic. */
  worn(id: number): boolean { return !!(this.flags[id] & 0x20); }
  setWorn(id: number, v: boolean) {
    this.flags[id] = (this.flags[id] & ~0x20) | (v ? 0x20 : 0);
  }

  /** Solid (non-transparent) menu icon background: swords/magic. */
  solid(id: number): boolean { return !!(this.flags[id] & 0x80); }
  setSolid(id: number, v: boolean) {
    this.flags[id] = (this.flags[id] & ~0x80) | (v ? 0x80 : 0);
  }

  write(prg: Uint8Array) {
    for (let id = 0; id < NUM_ITEMS; id++) prg[PRG_ITEM_DATA + id] = this.flags[id] & 0xff;
    for (let i = 0; i < 9; i++) {
      prg[PRG_SHIELD_DEFENSE + i] = this.shieldDefense[i] & 0xff;
      prg[PRG_ARMOR_DEFENSE + i] = this.armorDefense[i] & 0xff;
    }
  }
}
