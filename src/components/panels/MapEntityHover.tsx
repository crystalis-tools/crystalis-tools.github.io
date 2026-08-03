import {hex} from '../../rom/bytes';
import {SPAWN_TYPES} from '../../rom/constants';
import {itemLabel} from '../../labels/itemlabels';
import type {Location} from '../../rom/location';
import {SpawnType} from '../../rom/locationtables';
import type {Rom} from '../../rom/rom';
import type {Selection} from '../../state/store';

export function objectIdName(rom: Rom, type: number, id: number): string | undefined {
  if (type === SpawnType.MONSTER) return rom.objects.get((id + 0x50) & 0xff)?.name || undefined;
  if (type === SpawnType.NPC) return rom.npcs.get(id)?.name || undefined;
  // Chest/trigger ids $80+ are triggers; below that they're chests. Only
  // $00-$4f name as an item - the vanilla chest handler grants that id
  // directly. $50-$7f are real ids too (non-unique items indirect through a
  // vanilla lookup table; $70+ spawn a mimic instead), so naming those as
  // if they were the given item would be wrong - left as raw hex.
  if (type === SpawnType.CHEST_OR_TRIGGER && id < 0x50) return itemLabel(rom, id);
  return undefined;
}

/** Short title + detail lines for a map object, used by the hover peek
 * tooltip on the map canvas. Kept separate from the inline editor panels
 * since a hover peek needs a compact read-only summary, not fields. */
export function describeMapEntity(rom: Rom, loc: Location, kind: Selection['kind'], index: number):
    {title: string, lines: string[]} | null {
  if (kind === 'spawn') {
    const spawn = loc.spawns[index];
    if (!spawn) return null;
    const name = objectIdName(rom, spawn.type, spawn.id);
    return {
      title: SPAWN_TYPES[spawn.type] ?? `Type ${spawn.type}`,
      lines: [name ?? `${spawn.id}`],
    };
  }
  if (kind === 'exit') {
    const exit = loc.exits[index];
    if (!exit) return null;
    return {
      title: `Exit ${hex(index)}`,
      lines: [`To: ${rom.location(exit.dest).label}`, `Entrance: ${hex(exit.entrance)}`],
    };
  }
  if (kind === 'entrance') {
    const entrance = loc.entrances[index];
    if (!entrance) return null;
    return {title: `Entrance ${hex(index)}`, lines: []};
  }
  if (kind === 'flag') {
    const flag = loc.flags[index];
    if (!flag) return null;
    return {title: `Event Flag ${index}`, lines: [`Event Flag: 0x${hex(flag.flag, 3)}`]};
  }
  if (kind === 'pit') {
    const pit = loc.pits[index];
    if (!pit) return null;
    return {title: `Pit ${hex(index)}`, lines: [`To: ${rom.location(pit.dest).label}`]};
  }
  return null;
}
