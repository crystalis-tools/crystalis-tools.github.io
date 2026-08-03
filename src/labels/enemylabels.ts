import {hex} from '../rom/bytes';
import type {Location} from '../rom/location';
import type {Spawn} from '../rom/locationtables';
import type {Rom} from '../rom/rom';

/**
 * Distinct monster object ids actually placed on some location. Unlike items
 * there's no fixed monster table in the ROM - monsters only exist as spawns,
 * so "every enemy" means every id a placed, active MONSTER-type spawn uses
 * anywhere. Always derive the list this way rather than hardcoding ids.
 */
export function usedMonsterIds(rom: Rom): number[] {
  const ids = new Set<number>();
  for (const loc of rom.usedLocations) {
    for (const spawn of loc.spawns) {
      if (spawn.used && spawn.isMonster()) ids.add(spawn.monsterId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/** Display name for a monster id, read from the ROM's object table. */
export function enemyLabel(rom: Rom, id: number): string {
  return rom.objects.get(id)?.displayName ?? `Object $${hex(id)}`;
}

/**
 * A location and spawn where monster `id` is actually placed, used to pick
 * the CHR pattern bank and palette for its sprite preview - a monster's
 * pattern page is location-specific, so there's no context-free way to
 * render it. Returns the first placement found, in location order.
 */
export function findMonsterSpawn(
    rom: Rom, id: number): {loc: Location, spawn: Spawn} | null {
  for (const loc of rom.usedLocations) {
    for (const spawn of loc.spawns) {
      if (spawn.used && spawn.isMonster() && spawn.monsterId === id) {
        return {loc, spawn};
      }
    }
  }
  return null;
}
