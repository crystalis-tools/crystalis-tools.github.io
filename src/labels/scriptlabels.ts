import {flagLabel} from '../rom/flagnames';
import type {Npc} from '../rom/objects';
import type {Rom} from '../rom/rom';

export {flagLabel};

/** One editable dialogue block, referencing the NPC's own live
 *  `DialogEntry[]` array - `ScriptEditor`'s caller mutates it in place
 *  inside a `store.edit` transaction, so no copying happens here. */
export interface NpcScriptSection {
  key: string;
  title: string;
  /** Concrete map id for a map-specific section. Global and Default do not
   *  navigate to one particular map. */
  locationId?: number;
  entries: Npc['globalDialogs'];
  /** `false` for the global dialogue section - the ROM has no way to
   *  express a real always-on global entry, `condition === 0` there means
   *  "no dialogue" (see `Npc.globalDialogs`), so it isn't offered. */
  allowAlwaysCondition: boolean;
  /** Whether lines in this section carry a real `updateAction` byte - only
   *  true for local sections; global entries have no room for one in the
   *  ROM format (see `DialogEntry.updateAction`). */
  allowUpdateAction: boolean;
}

/** This NPC's full dialogue script: the location-independent global dialogue
 *  section (global dialogue, checked everywhere before any local entry),
 *  followed by one section per location that overrides it, or a shared
 *  default dialogue section if it has no per-location overrides. */
export function npcDialogSections(rom: Rom, npc: Npc): NpcScriptSection[] {
  const sections: NpcScriptSection[] = [
    {
      key: 'global',
      title: 'Priority Dialog',
      entries: npc.globalDialogs,
      allowAlwaysCondition: false,
      allowUpdateAction: false,
    },
  ];
  for (const [loc, entries] of npc.localDialogs) {
    sections.push({
      key: `loc:${loc}`,
      title: loc === -1 ? 'Fallback Dialog' : rom.location(loc).label,
      locationId: loc === -1 ? undefined : loc,
      entries,
      allowAlwaysCondition: true,
      allowUpdateAction: true,
    });
  }
  return sections;
}

/** Names for the NPC-behavior byte that follows local dialogue entries
 *  (`DialogEntry.updateAction`), from the vanilla disassembly's
 *  `DialogFollowupActionJump` table. Slots not listed here are unused
 *  no-ops in the vanilla ROM. */
const UPDATE_ACTION_NAMES: Record<number, string> = {
  0x02: 'Disappear',
  0x03: 'Give item (slot 2)',
  0x05: 'Kensu turns to slime',
  0x06: 'Walk away',
  0x08: 'Open Swan gate',
  0x09: 'Give 100 gold',
  0x0a: 'Drop boss chest, give lamp',
  0x0c: 'Dwarf child follows',
  0x0d: 'Walk away',
  0x10: 'Reveal change magic',
  0x11: 'Give item (slot 1)',
  0x14: 'Grant Flight, heal, disappear',
  0x16: 'Play dialog SFX',
  0x17: 'Heal player, disappear',
  0x19: 'Give Shield Ring, walk out',
  0x1a: 'Give Ball of Water',
  0x1b: 'Eject from lime tree',
};

/** What each `updateAction` byte actually runs in vanilla code, straight
 *  from `DialogFollowupActionJump` in the disassembly - shown as a tooltip
 *  in the action picker. Every id is real 6502 code the dispatch table
 *  jumps to; ids missing here fall through to a shared NOOP stub (no
 *  disassembly label of their own, just "does nothing"). */
const UPDATE_ACTION_DESCRIPTIONS: Record<number, string> = {
  0x00: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x01: 'Unnamed vanilla routine - not yet identified in the disassembly.',
  0x02: 'NPC despawns permanently at this location.',
  0x03: 'Grants the item id stored in this NPC\'s own "give item (slot 2)" field.',
  0x04: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x05: 'Kensu transforms into his slime disguise.',
  0x06: 'NPC walks away and stops being interactable (e.g. treasure hunter).',
  0x07: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x08: 'Opens the Swan gate.',
  0x09: 'Plays the treasure jingle and grants 100 gold.',
  0x0a: 'Drops the location\'s boss chest and grants the lamp.',
  0x0b: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x0c: 'The dwarf child starts following the player.',
  0x0d: 'Same as 0x06 - NPC walks away and stops being interactable.',
  0x0e: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x0f: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x10: 'NPC reveals the "change" magic spell (Asina/Kensu).',
  0x11: 'Grants the item id stored in this NPC\'s own "give item (slot 1)" field.',
  0x12: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x13: 'Reloads this location\'s NPC data (used after a state change).',
  0x14: 'Grants Flight, heals the player, then disappears.',
  0x15: 'Unnamed vanilla routine - not yet identified in the disassembly.',
  0x16: 'Plays the dialog-box sound effect.',
  0x17: 'Heals the player, then disappears.',
  0x18: 'Unnamed vanilla routine - not yet identified in the disassembly.',
  0x19: 'Grants a hard-coded Shield Ring, then the NPC walks out.',
  0x1a: 'Grants a hard-coded Ball of Water.',
  0x1b: 'Ejects the player from the lime tree.',
  0x1c: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x1d: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x1e: 'Unused - jumps to the shared NOOP stub, no effect.',
  0x1f: 'Unused - jumps to the shared NOOP stub, no effect.',
};

/** Every `updateAction` byte value the vanilla dialog-action jump table
 *  dispatches on (0x00-0x1f), for use in a picker. */
export const UPDATE_ACTION_IDS = Array.from({length: 0x20}, (_, i) => i);

export function updateActionLabel(id: number): string | undefined {
  return UPDATE_ACTION_NAMES[id];
}

/** Tooltip/subtitle text describing what this action byte runs in vanilla
 *  code - see `RomModifications.md` for how this table was derived. */
export function updateActionDescription(id: number): string | undefined {
  return UPDATE_ACTION_DESCRIPTIONS[id];
}

/** Action ids that read this NPC's own give-item field (see
 *  `Npc.giveItemSlot1`/`giveItemSlot2`) rather than being self-contained. */
export function updateActionGiveItemSlot(id: number): 1 | 2 | undefined {
  if (id === 0x11) return 1;
  if (id === 0x03) return 2;
  return undefined;
}
