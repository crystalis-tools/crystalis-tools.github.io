import {hex} from '../rom/bytes';
import type {Rom} from '../rom/rom';
import type {Trigger} from '../rom/trigger';

/** Triggers actually spawned somewhere in the vanilla ROM. */
export function usedTriggers(rom: Rom): Trigger[] {
  return rom.triggers.list();
}

export function triggerLabel(t: Trigger): string {
  return `Trigger $${hex(t.id)}`;
}

export function triggerHex(id: number): string {
  return `0x${hex(id)}`;
}
