import {hex} from '../rom/bytes';
import type {Location} from '../rom/location';
import type {Spawn} from '../rom/locationtables';
import type {Npc} from '../rom/objects';
import type {Rom} from '../rom/rom';

/** Every NPC with a real appearance in the ROM's fixed NPC table (unlike
 *  monsters, NPCs aren't derived from spawns - id 0-255 is a fixed table). */
export function allNpcs(rom: Rom): Npc[] {
  return rom.npcs.list();
}

/** Display name for an NPC id, read from the ROM's NPC name table. */
export function npcLabel(rom: Rom, id: number): string {
  return rom.npcs.get(id)?.displayName ?? `NPC $${hex(id)}`;
}

/**
 * A location and spawn where NPC `id` is actually placed, used to pick the
 * CHR pattern bank and palette for its sprite preview - an NPC's pattern
 * page is location-specific, so there's no context-free way to render it.
 * Returns the first placement found, in location order.
 */
export function findNpcSpawn(
    rom: Rom, id: number): {loc: Location, spawn: Spawn} | null {
  for (const loc of rom.usedLocations) {
    for (const spawn of loc.spawns) {
      if (spawn.used && spawn.isNpc() && spawn.id === id) {
        return {loc, spawn};
      }
    }
  }
  return null;
}
