import {hex, readLE16, writeLE16} from './bytes';
import {
  MESSAGE_PTR_DELTA_14, MESSAGE_PTR_DELTA_16, MESSAGE_PTR_DELTA_17,
  NUM_MESSAGE_PARTS, NUM_PERSON_NAMES, NUM_UNCOMMON_WORDS, PRG_COMMON_WORDS,
  PRG_MESSAGE_BANKS, PRG_MESSAGE_PARTS, PRG_PERSON_NAMES, PRG_UNCOMMON_WORDS,
} from './constants';
import type {ItemNames} from './itemnames';
import {Arena} from './writer';

/** Safety cap on a single message's byte length, in case a bad offset sends
 *  the decoder off into unrelated data with no nearby $00 terminator. */
const MAX_MESSAGE_BYTES = 1000;

/** Characters after which a dictionary-word substitution's trailing space is
 *  suppressed (it's either already a delimiter or would double up a literal
 *  space that follows in the ROM data). */
const PUNCTUATION = new Set([
  '\0', ' ', '!', '\'', ',', '.', ':', ';', '?', '_', '\n', '#',
]);

/** Whether the game inserts a visible separator after a dictionary token.
 * It also stages a space before a line/page control, but that space is never
 * displayed; omit it from the editor's semantic text so save/load is stable. */
function tokenNeedsVisibleSpace(nextByte: number): boolean {
  if (nextByte >= 0 && nextByte <= 3) return false;
  return !PUNCTUATION.has(String.fromCharCode(nextByte));
}

/** NES CPU-visible bank size; every message-body bank owns one such window
 *  of PRG bytes, starting at `bank * BANK_SIZE`. */
const BANK_SIZE = 0x2000;

/**
 * NPC dialogue and system text, read from the compressed message tables in
 * banks $15-$17. Each message is a byte stream with control codes for line
 * breaks and dictionary-word substitution (common words, "uncommon" words,
 * person/place names, and item names, the last shared with `ItemNames`).
 *
 * Editing automatically reuses all of those existing dictionaries. Common
 * words cost one byte; uncommon words, names, and item names cost two. An
 * edit that still fits in the byte span the original message occupied is
 * written in place; a longer one is relocated into free ($ff-padding) space
 * in the same bank and its pointer-table entry is repointed.
 */
export class Messages {
  private readonly parts: string[][] = [];
  /** Original PRG offset of each message's byte stream. */
  private readonly offsets: number[][] = [];
  /** Byte span (including the terminator) the original message occupies. */
  private readonly capacities: number[][] = [];
  /** PRG offset of part `p`'s own pointer table (one LE16 entry/message). */
  private readonly partTableStart: number[] = [];
  /** Bank byte ($15/$16/$17/...) each part's messages live in. */
  private readonly partBank: number[] = [];
  /** part/index keys of messages whose text has been edited. */
  private readonly edited = new Set<string>();
  private readonly commonWords: string[];
  private readonly uncommonWords: string[];
  private readonly personNames: string[];
  private readonly itemNames: ItemNames;

  constructor(prg: Uint8Array, itemNames: ItemNames) {
    const commonWords = readWordTable(prg, PRG_COMMON_WORDS, 0x80);
    const uncommonWords = readWordTable(prg, PRG_UNCOMMON_WORDS, NUM_UNCOMMON_WORDS);
    const personNames = readWordTable(prg, PRG_PERSON_NAMES, NUM_PERSON_NAMES);
    this.commonWords = commonWords;
    this.uncommonWords = uncommonWords;
    this.personNames = personNames;
    this.itemNames = itemNames;
    const banks = Array.from(
        {length: NUM_MESSAGE_PARTS}, (_, i) => prg[PRG_MESSAGE_BANKS + i]);

    // Part table lengths aren't stored explicitly - each part's message
    // count is inferred from where the next part's pointer table starts.
    let lastPartAddr = PRG_MESSAGE_BANKS;
    for (let p = NUM_MESSAGE_PARTS - 1; p >= 0; p--) {
      const start = readLE16(prg, PRG_MESSAGE_PARTS + p * 2) + MESSAGE_PTR_DELTA_14;
      const len = Math.max(0, (lastPartAddr - start) >>> 1);
      lastPartAddr = start;
      this.partTableStart[p] = start;
      this.partBank[p] = banks[p];
      const delta = bankDelta(banks[p]);
      const texts: string[] = [];
      const offsets: number[] = [];
      const capacities: number[] = [];
      for (let i = 0; i < len; i++) {
        const addr = readLE16(prg, start + i * 2) + delta;
        const decoded = decodeMessage(prg, addr, commonWords, uncommonWords, personNames, itemNames);
        texts.push(decoded.text);
        offsets.push(addr);
        capacities.push(addr ? decoded.length : 0);
      }
      this.parts[p] = texts;
      this.offsets[p] = offsets;
      this.capacities[p] = capacities;
    }
  }

  get partCount(): number {
    return this.parts.length;
  }

  countInPart(part: number): number {
    return this.parts[part]?.length ?? 0;
  }

  get(part: number, index: number): string | null {
    return this.parts[part]?.[index] ?? null;
  }

  /** Every message in the ROM, in part/index order. */
  * entries(): Iterable<{part: number, index: number, text: string}> {
    for (let part = 0; part < this.parts.length; part++) {
      for (let index = 0; index < this.parts[part].length; index++) {
        yield {part, index, text: this.parts[part][index]};
      }
    }
  }

  /** Replace a message's text. Throws if the text uses unsupported
   *  characters or control sequences. */
  set(part: number, index: number, text: string) {
    if (!this.offsets[part]?.[index]) {
      throw new Error(`No message at part $${hex(part)} index $${hex(index)}.`);
    }
    this.encode(text); // validate eagerly so bad input is rejected at edit time
    this.parts[part][index] = text;
    this.edited.add(`${part},${index}`);
  }

  /** Write every edited message back into `prg`, relocating any that grew
   *  past the byte span its original text occupied. Returns a warning for
   *  each message that could not be relocated (its old text is left in
   *  place). */
  write(prg: Uint8Array): string[] {
    const warnings: string[] = [];
    const arenas = new Map<number, Arena>();
    const arenaFor = (bank: number): Arena => {
      let arena = arenas.get(bank);
      if (!arena) {
        const start = bank * BANK_SIZE;
        arena = new Arena(`message bank $${hex(bank)}`, start, start + BANK_SIZE);
        arena.seedFromPadding(prg, []);
        arenas.set(bank, arena);
      }
      return arena;
    };

    for (const key of this.edited) {
      const [part, index] = key.split(',').map(Number);
      const bytes = this.encode(this.parts[part][index]);
      bytes.push(0);
      const capacity = this.capacities[part][index];
      let offset = this.offsets[part][index];
      if (bytes.length > capacity) {
        const bank = this.partBank[part];
        const arena = arenaFor(bank);
        const alloc = arena.alloc(bytes.length);
        if (alloc == null) {
          warnings.push(
              `Message $${hex(part)}/$${hex(index)} is ${bytes.length} bytes ` +
              `and no free space remains in bank $${hex(bank)}; left unchanged.`);
          continue;
        }
        offset = alloc;
        writeLE16(prg, this.partTableStart[part] + index * 2, offset - bankDelta(bank));
      }
      prg.set(bytes, offset);
    }
    return warnings;
  }

  private encode(text: string): number[] {
    return encodeMessage(
        text, this.commonWords, this.uncommonWords, this.personNames, this.itemNames);
  }
}

function bankDelta(bank: number): number {
  if (bank === 0x16) return MESSAGE_PTR_DELTA_16;
  if (bank === 0x17) return MESSAGE_PTR_DELTA_17;
  return MESSAGE_PTR_DELTA_14;
}

/** A pointer table of `count` null-terminated ASCII strings. */
function readWordTable(prg: Uint8Array, base: number, count: number): string[] {
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = readLE16(prg, base + i * 2);
    words.push(ptr ? readCString(prg, ptr + MESSAGE_PTR_DELTA_14) : '');
  }
  return words;
}

function readCString(prg: Uint8Array, offset: number): string {
  const bytes: number[] = [];
  while (offset < prg.length && prg[offset] !== 0) bytes.push(prg[offset++]);
  return String.fromCharCode(...bytes);
}

function decodeMessage(prg: Uint8Array, offset: number, commonWords: string[],
                       uncommonWords: string[], personNames: string[],
                       itemNames: ItemNames): {text: string, length: number} {
  if (!offset || offset >= prg.length) return {text: '', length: 0};
  let text = '';
  let i = offset;
  for (let guard = 0; guard < MAX_MESSAGE_BYTES && prg[i]; guard++) {
    const b = prg[i];
    if (b === 1) {
      i++;
    } else if (b === 2) {
      text += '\n';
      i++;
    } else if (b === 3) {
      text += '{PAGE BREAK}\n';
      i++;
    } else if (b === 4) {
      text += '{NAME}';
      i++;
    } else if (b === 8) {
      text += '{ITEM}';
      i++;
    } else if (b >= 5 && b <= 9) {
      const next = prg[i + 1];
      if (b === 9) {
        text += ' '.repeat(next);
      } else if (b === 5) {
        text += uncommonWords[next] || `{word $${hex(next)}}`;
      } else if (b === 6) {
        text += personNames[next] || `{name $${hex(next)}}`;
      } else {
        text += itemNames.get(next) || `{ITEM 0x${hex(next)}}`;
      }
      i += 2;
      if (b !== 9 && tokenNeedsVisibleSpace(prg[i])) text += ' ';
    } else if (b >= 0x80) {
      text += commonWords[b - 0x80] || `{word $${hex(b)}}`;
      i++;
      if (tokenNeedsVisibleSpace(prg[i])) text += ' ';
    } else if (b >= 0x20) {
      text += String.fromCharCode(b);
      i++;
    } else {
      // Unrecognised control byte - skip defensively rather than throwing,
      // since a malformed pointer could otherwise wedge the whole ROM load.
      i++;
    }
  }
  // `i` sits on the terminating $00 (or ran past MAX_MESSAGE_BYTES); either
  // way the byte at `i` is included in the span this message occupies.
  return {text, length: i - offset + 1};
}

interface DictionaryToken {
  text: string;
  bytes: readonly number[];
}

/** All existing ROM dictionary entries, ordered by bytes saved and then by
 * match length. Suffix entries such as "ing" and "ed" are intentionally
 * allowed: the vanilla dictionary was designed to chain them onto literals. */
function dictionaryTokens(commonWords: string[], uncommonWords: string[],
                          personNames: string[], itemNames: ItemNames): DictionaryToken[] {
  const tokens: DictionaryToken[] = [];
  commonWords.forEach((text, id) => {
    if (text.length > 1) tokens.push({text, bytes: [0x80 + id]});
  });
  const addTwoByteTokens = (words: string[], control: number) => {
    words.forEach((text, id) => {
      if (text.length > 2) tokens.push({text, bytes: [control, id]});
    });
  };
  addTwoByteTokens(uncommonWords, 5);
  addTwoByteTokens(personNames, 6);
  const items: string[] = [];
  for (let id = 0; id < 0x100; id++) items.push(itemNames.get(id));
  addTwoByteTokens(items, 7);
  return tokens.sort((a, b) =>
    (b.text.length - b.bytes.length) - (a.text.length - a.bytes.length) ||
    b.text.length - a.text.length || a.bytes.length - b.bytes.length);
}

/** A dictionary token automatically supplies the ordinary separator before
 * a following word. Consume that one space from the source only when doing
 * so is lossless; spaces before punctuation, another space, or end-of-text
 * remain literal. */
function consumesFollowingSpace(text: string, afterWord: number): boolean {
  if (text[afterWord] !== ' ') return false;
  const following = text[afterWord + 1];
  return following != null && !PUNCTUATION.has(following);
}

/** Reverse of `decodeMessage`: printable ASCII, control sequences, and the
 * ROM's existing word/name dictionaries. The game's required start-page
 * marker is emitted automatically, including after each page break; the
 * caller remains responsible for appending the terminator. */
function encodeMessage(text: string, commonWords: string[], uncommonWords: string[],
                       personNames: string[], itemNames: ItemNames): number[] {
  // Control $01 initializes the game's message buffer and write cursor. It is
  // part of the wire format, not user-authored text: every vanilla message
  // starts with it, and every $03 page break is followed by another one.
  const bytes: number[] = [1];
  const tokens = dictionaryTokens(commonWords, uncommonWords, personNames, itemNames);
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('{NAME}', i)) {
      bytes.push(4);
      i += 6;
    } else if (text.startsWith('{ITEM}', i)) {
      bytes.push(8);
      i += 6;
    } else if (/^\{ITEM 0x[0-9a-fA-F]{2}\}/.test(text.slice(i, i + 11))) {
      bytes.push(7, parseInt(text.slice(i + 7, i + 9), 16));
      i += 11;
    } else if (text.startsWith('{PAGE BREAK}', i)) {
      // A page break is `$03 $01` in the ROM's wire format - the $01 is the
      // same buffer-init control every message starts with, just re-emitted
      // for the new page.
      bytes.push(3, 1);
      i += 12;
      if (text[i] === '\n') i++; // `decodeMessage` appends this for display.
    } else if (text[i] === '\n') {
      bytes.push(2);
      i++;
    } else {
      const token = tokens.find(candidate => {
        if (!text.startsWith(candidate.text, i)) return false;
        const after = text[i + candidate.text.length];
        return after == null || PUNCTUATION.has(after);
      });
      if (token) {
        bytes.push(...token.bytes);
        i += token.text.length;
        if (consumesFollowingSpace(text, i)) i++;
        continue;
      }
      const code = text.charCodeAt(i);
      if (code < 0x20 || code > 0x7e) {
        throw new Error(
            `Unsupported character "${text[i]}" in message text; ` +
            `only printable ASCII, newlines, {NAME}, {ITEM}, {ITEM 0xNN} and {PAGE BREAK} are allowed.`);
      }
      bytes.push(code);
      i += 1;
    }
  }
  return bytes;
}
