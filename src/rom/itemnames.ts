import {ITEM_NAME_PTR_DELTA, NUM_ITEMS, PRG_ITEM_NAMES} from './constants';
import {readLE16} from './bytes';

/**
 * Item name strings used in message text (e.g. "Sword of Wind"), read from
 * the pointer table at `PRG_ITEM_NAMES`.  Distinct from the menu's abbreviated
 * item names, which use a separate encoded table not modelled here.
 *
 * Names are rewritten in place at their original PRG offset, so an edited
 * name can be no longer (including its null terminator) than the string it
 * replaces - there's no free-space tracking for this table to relocate a
 * longer string into. `maxLength` reports the room available for each id.
 */
export class ItemNames {
  private readonly names: string[] = [];
  /** Original PRG offset of each id's string, or 0 if it has none. */
  private readonly offsets: number[] = [];
  /** Byte budget (including the null terminator) available at that offset. */
  private readonly capacities: number[] = [];

  constructor(prg: Uint8Array) {
    for (let id = 0; id < NUM_ITEMS; id++) {
      const ptr = readLE16(prg, PRG_ITEM_NAMES + id * 2);
      const offset = ptr ? ptr + ITEM_NAME_PTR_DELTA : 0;
      this.offsets.push(offset);
      const name = offset ? readString(prg, offset) : '';
      this.names.push(name);
      this.capacities.push(offset ? name.length + 1 : 0);
    }
  }

  get(id: number): string {
    return this.names[id] ?? '';
  }

  /** Longest name (in characters, not counting the null terminator) that can
   *  be written back for this id. 0 if the id has no name to begin with. */
  maxLength(id: number): number {
    return Math.max(0, (this.capacities[id] ?? 0) - 1);
  }

  set(id: number, name: string) {
    if (name.length > this.maxLength(id)) {
      throw new Error(
          `"${name}" is too long for item $${id.toString(16)} ` +
          `(max ${this.maxLength(id)} characters).`);
    }
    if (!/^[\x20-\x7e]*$/.test(name)) {
      throw new Error(`Item names may only use printable ASCII characters.`);
    }
    this.names[id] = name;
  }

  write(prg: Uint8Array) {
    for (let id = 0; id < NUM_ITEMS; id++) {
      const offset = this.offsets[id];
      if (!offset) continue;
      const name = this.names[id];
      for (let i = 0; i < name.length; i++) prg[offset + i] = name.charCodeAt(i);
      prg[offset + name.length] = 0;
    }
  }
}

function readString(prg: Uint8Array, offset: number): string {
  const bytes: number[] = [];
  while (offset < prg.length && prg[offset] !== 0) bytes.push(prg[offset++]);
  return String.fromCharCode(...bytes);
}
