import {hex} from '../rom/bytes';
import type {Rom} from '../rom/rom';

export interface MessageEntry {
  part: number;
  index: number;
  text: string;
}

/** Every message in the ROM's dialogue tables, in part/index order. */
export function allMessages(rom: Rom): MessageEntry[] {
  return [...rom.messages.entries()];
}

export function messageKey(part: number, index: number): string {
  return `${part}:${index}`;
}

export function messageHex(part: number, index: number): string {
  return `${hex(part)}${hex(index)}`;
}

/** A one-line preview, since messages don't have names of their own. */
export function messagePreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '(empty)';
  return flat.length > 28 ? flat.slice(0, 28) + '…' : flat;
}

/** Every message as `{part, index, label}`, for a searchable message
 *  picker (`MessageRefEditor`) - shared by every script-shaped editor. */
export function messagePickerOptions(rom: Rom): Array<{part: number, index: number, label: string}> {
  return allMessages(rom).map(m => ({
    part: m.part,
    index: m.index,
    label: `${messageHex(m.part, m.index)} - ${messagePreview(m.text)}`,
  }));
}
