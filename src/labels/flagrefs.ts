import {locationLabel} from '../rom/nametables';
import type {Rom} from '../rom/rom';
import {triggerHex} from './triggerlabels';

export interface FlagRef {
  label: string;
  onClick: () => void;
}

function magnitude(signed: number): number {
  return signed < 0 ? ~signed : signed;
}

/** Every place besides the given map Flag that reacts to a flag id: trigger
 *  conditions/effects, NPC visibility requirements, and NPC dialogue
 *  conditions/effects. Map Flags themselves aren't scriptable (they're just
 *  a screen/id pair the engine checks in hardcoded logic), so this is the
 *  closest thing to "what does this flag do." */
export function findFlagReferences(rom: Rom, flagId: number, actions: {
  openTrigger: (id: number) => void,
  openNpc: (id: number) => void,
  openLocation: (id: number) => void,
}, excludeLocationId?: number): FlagRef[] {
  const refs: FlagRef[] = [];

  for (const trigger of rom.triggers.list()) {
    if (trigger.conditions.some(c => magnitude(c) === flagId)) {
      refs.push({label: `Trigger ${triggerHex(trigger.id)} - condition`, onClick: () => actions.openTrigger(trigger.id)});
    }
    if (trigger.flags.some(f => magnitude(f) === flagId)) {
      refs.push({label: `Trigger ${triggerHex(trigger.id)} - sets/clears`, onClick: () => actions.openTrigger(trigger.id)});
    }
  }

  for (let id = 0; id < 0x100; id++) {
    const npc = rom.npcs.get(id);
    if (!npc) continue;
    for (const [locationId, conditions] of npc.visibility) {
      if (conditions.some(c => magnitude(c) === flagId)) {
        refs.push({
          label: `${npc.displayName} - visible at ${locationLabel(locationId)}`,
          onClick: () => actions.openNpc(id),
        });
      }
    }
    const dialogSections = [...npc.globalDialogs.length ? [npc.globalDialogs] : [], ...npc.localDialogs.values()];
    for (const entries of dialogSections) {
      for (const entry of entries) {
        if (magnitude(entry.condition) === flagId || entry.flags.some(f => magnitude(f) === flagId)) {
          refs.push({label: `${npc.displayName} - dialogue`, onClick: () => actions.openNpc(id)});
          break;
        }
      }
    }
  }

  for (const loc of rom.usedLocations) {
    if (loc.id === excludeLocationId) continue;
    for (const flag of loc.flags) {
      if (flag.flag === flagId) {
        refs.push({label: `${locationLabel(loc.id)} - screen flag`, onClick: () => actions.openLocation(loc.id)});
      }
    }
  }

  return refs;
}
