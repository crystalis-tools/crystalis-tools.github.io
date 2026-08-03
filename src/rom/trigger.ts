import {readLE16, writeLE16} from './bytes';
import {
  NUM_TRIGGERS, PRG_TRIGGER_PTRS, TRIGGER_ARENA, TRIGGER_ID_BASE,
  TRIGGER_PTR_DELTA, UNUSED_TRIGGER_IDS,
} from './constants';
import {isSuffix, Packer} from './writer';

/** A reference to one dialogue message, as `{part}:{index}` into `Messages`. */
export interface MessageRef {
  part: number;
  index: number;
}

/**
 * A trigger action: a list of flag conditions to check, a message to show,
 * and a list of flags to set/clear, run when a player steps on a trigger
 * spawn (or via NPC dialogue). A negative flag id means "must be clear"
 * (conditions) or "clear this flag" (`flags`); a positive one means "must be
 * set" / "set this flag".
 *
 * Both `conditions` and `flags` always have at least one entry - the byte
 * format has no way to express an empty list, only edit them through
 * `TriggerView`'s UI, which enforces that floor.
 */
export class Trigger {
  readonly used: boolean;
  readonly conditions: number[] = [];
  readonly flags: number[] = [];
  readonly message: MessageRef;

  constructor(prg: Uint8Array, readonly id: number) {
    this.used = !UNUSED_TRIGGER_IDS.has(id);
    const pointer = PRG_TRIGGER_PTRS + (id & 0x7f) * 2;
    let i = readLE16(prg, pointer) + TRIGGER_PTR_DELTA;

    let word: number;
    do {
      // NOTE: this byte order is big-endian, unlike most 16-bit reads.
      word = (prg[i] << 8) | prg[i + 1];
      const flag = word & 0x0fff;
      this.conditions.push(word & 0x2000 ? ~flag : flag);
      i += 2;
    } while (!(word & 0x8000));

    const mb0 = prg[i];
    const mb1 = prg[i + 1];
    this.message = {
      part: ((mb0 & 0x07) << 3) | ((mb1 & 0xe0) >>> 5),
      index: mb1 & 0x1f,
    };

    do {
      i += 2;
      word = (prg[i] << 8) | prg[i + 1];
      const flag = word & 0x0fff;
      this.flags.push(word & 0x8000 ? ~flag : flag);
    } while (!(word & 0x4000));
  }

  /** Re-encode this trigger's condition/message/flags as bytes - the
   *  reverse of the constructor's parse. Note conditions and flags use
   *  different sign/terminator bit positions from each other (and from NPC
   *  dialogue's condition words), matched exactly to what the parser above
   *  expects. */
  encodeBlob(): number[] {
    const bytes: number[] = [];
    this.conditions.forEach((condition, i) => {
      const last = i === this.conditions.length - 1;
      const negative = condition < 0;
      const magnitude = (negative ? ~condition : condition) & 0x0fff;
      let word = magnitude;
      if (negative) word |= 0x2000;
      if (last) word |= 0x8000;
      bytes.push(word >>> 8, word & 0xff);
    });
    bytes.push((this.message.part >> 3) & 0x07, ((this.message.part & 7) << 5) | (this.message.index & 0x1f));
    this.flags.forEach((flag, i) => {
      const last = i === this.flags.length - 1;
      const negative = flag < 0;
      const magnitude = (negative ? ~flag : flag) & 0x0fff;
      let word = magnitude;
      if (negative) word |= 0x8000;
      if (last) word |= 0x4000;
      bytes.push(word >>> 8, word & 0xff);
    });
    return bytes;
  }
}

export class Triggers {
  private readonly all: Trigger[] = [];

  constructor(prg: Uint8Array) {
    for (let i = 0; i < NUM_TRIGGERS; i++) {
      this.all.push(new Trigger(prg, TRIGGER_ID_BASE | i));
    }
  }

  get(id: number): Trigger | null {
    return this.all.find(t => t.id === id) ?? null;
  }

  /** Triggers actually spawned somewhere in the vanilla ROM. */
  list(): Trigger[] {
    return this.all.filter(t => t.used);
  }

  /**
   * Re-encode and repack every trigger into `TRIGGER_ARENA`, only if
   * `dirty` - this table is packed with almost no spare bytes (2 across
   * all 67 vanilla triggers), so it's a full repack rather than an
   * in-place write, same strategy as `Npcs.write` for NPC dialogue,
   * including suffix-sharing to squeeze out what little slack exists. On
   * failure it pushes a warning and writes nothing (the caller discards
   * the whole build attempt on any warning).
   */
  write(prg: Uint8Array, dirty: boolean, warnings: string[]) {
    if (!dirty) return;

    const blobs = this.all.map(t => ({trigger: t, bytes: t.encodeBlob()}));
    const byLengthDesc = [...blobs].sort((a, b) => b.bytes.length - a.bytes.length);
    const roots: number[][] = [];
    const placement = new Map<Trigger, {root: number[], tailStart: number}>();
    for (const {trigger, bytes} of byLengthDesc) {
      const host = roots.find(root => isSuffix(bytes, root));
      if (host) {
        placement.set(trigger, {root: host, tailStart: host.length - bytes.length});
      } else {
        roots.push(bytes);
        placement.set(trigger, {root: bytes, tailStart: 0});
      }
    }

    const packer = new Packer([{start: TRIGGER_ARENA[0], end: TRIGGER_ARENA[1]}]);
    const failure = packer.placeAll(roots);
    if (failure) {
      warnings.push(
          `Trigger data is full: ${packer.capacity} bytes total, ` +
          `${packer.remaining} free, and a ${failure.length}-byte trigger ` +
          `does not fit. Shorten a trigger's conditions/flags elsewhere to ` +
          `make room. No changes were written.`);
      return;
    }
    for (const root of roots) prg.set(root, packer.offsetOf(root)!);
    for (const {trigger} of blobs) {
      const {root, tailStart} = placement.get(trigger)!;
      const offset = packer.offsetOf(root)! + tailStart;
      writeLE16(prg, PRG_TRIGGER_PTRS + (trigger.id & 0x7f) * 2, offset - TRIGGER_PTR_DELTA);
    }
  }
}
