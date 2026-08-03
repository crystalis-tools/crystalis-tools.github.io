import {NUM_ITEMS} from '../rom/constants';
import type {Rom} from '../rom/rom';

export const UNNAMED_ITEM = '(unnamed)';

/** Every item id in the ROM's item-name table, in order. The single source
 *  of truth for "what items exist" - callers should list items from here
 *  rather than hardcoding ids or names. */
export function allItemIds(): number[] {
  const ids: number[] = [];
  for (let id = 0; id < NUM_ITEMS; id++) ids.push(id);
  return ids;
}

/** Display name for an item id, read from the ROM's item-name table. */
export function itemLabel(rom: Rom, id: number): string {
  return rom.itemNames.get(id) || UNNAMED_ITEM;
}
