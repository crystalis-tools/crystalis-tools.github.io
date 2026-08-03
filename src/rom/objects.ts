import {NPC_DIALOG_ARENA, NPC_DIALOG_EMPTY_PTR, NPC_DIALOG_PTR_DELTA,
        NPC_VISIBILITY_ARENA, NPC_VISIBILITY_PTR_DELTA, NUM_NPC_DIALOG_IDS,
        PRG_NPC_DATA, PRG_NPC_DIALOG_PTRS, PRG_NPC_VISIBILITY_PTRS,
        PRG_OBJECT_PTRS, PRG_OBJECT_WINDOW} from './constants';
import {hex, readLE16, tuple, writeLE16} from './bytes';
import {npcName, objectName} from './nametables';
import type {MessageRef} from './trigger';
import {isSuffix, Packer} from './writer';

interface FieldSpec {
  /** Index into `ObjectData.data`. */
  slot: number;
  mask: number;
  shift: number;
}

/**
 * Byte/bitfield layout of the editable object properties. Several fields
 * share a slot with another field (e.g. level/poison both live in slot 9),
 * so edits always read-modify-write the byte rather than overwriting it.
 */
const FIELDS = {
  hp: {slot: 6, mask: 0xff, shift: 0},
  atk: {slot: 7, mask: 0xff, shift: 0},
  def: {slot: 8, mask: 0xff, shift: 0},
  speed: {slot: 2, mask: 0x0f, shift: 0},
  collisionPlane: {slot: 5, mask: 0xf0, shift: 4},
  level: {slot: 9, mask: 0x1f, shift: 0},
  poison: {slot: 9, mask: 0x80, shift: 7},
  child: {slot: 10, mask: 0xff, shift: 0},
  terrainSusceptibility: {slot: 11, mask: 0xff, shift: 0},
  immobile: {slot: 13, mask: 0x80, shift: 7},
  replacement: {slot: 14, mask: 0xff, shift: 0},
  goldDrop: {slot: 16, mask: 0xf0, shift: 4},
  elements: {slot: 16, mask: 0x0f, shift: 0},
  expReward: {slot: 17, mask: 0xff, shift: 0},
  attackType: {slot: 18, mask: 0xff, shift: 0},
  statusEffect: {slot: 19, mask: 0x0f, shift: 0},
} satisfies Record<string, FieldSpec>;
type Field = keyof typeof FIELDS;

/**
 * A monster/object definition.  The 32 property slots are stored sparsely: a
 * bitmask byte precedes each group of eight values, and only the slots whose
 * bit is set are present in the stream. Editing a slot that isn't present
 * would require growing the record (and relocating it), which nothing here
 * supports yet, so `editable()` reports which slots can be written in place.
 */
export class ObjectData {
  readonly base: number;
  readonly sfx: number;
  /** All 32 property slots, zero-filled where the ROM omits them. */
  readonly data: number[];
  readonly name: string;
  /** PRG offset of each present slot, or null where the ROM omits it. */
  private readonly slotOffsets: Array<number | null>;

  constructor(prg: Uint8Array, readonly id: number) {
    this.base = readLE16(prg, PRG_OBJECT_PTRS + (id << 1)) + PRG_OBJECT_WINDOW;
    this.sfx = prg[this.base];
    this.name = objectName(id);

    this.data = [];
    this.slotOffsets = [];
    let cursor = this.base + 1;
    let mask = 0;
    for (let i = 0; i < 32; i++) {
      if (!(i & 7)) mask = prg[cursor++];
      if (mask & 0x80) {
        this.slotOffsets.push(cursor);
        this.data.push(prg[cursor++]);
      } else {
        this.slotOffsets.push(null);
        this.data.push(0);
      }
      mask = (mask << 1) & 0xff;
    }
  }

  /** Slot 0: the metasprite this object draws with. */
  get metasprite(): number { return this.data[0]; }
  set metasprite(v: number) {
    if (this.slotOffsets[0] == null) {
      throw new Error(
          `Object $${hex(this.id)} has no metasprite slot in its ROM record.`);
    }
    this.data[0] = v & 0xff;
  }
  get metaspriteEditable(): boolean { return this.slotOffsets[0] != null; }
  /** Slot 13, low 7 bits: the object's AI routine. */
  get action(): number { return this.data[13] & 0x7f; }
  /** Slot 31: base metasprite for direction-facing walkers. */
  get directionBase(): number { return this.data[31]; }

  get displayName(): string {
    return this.name || `Object $${this.id.toString(16).padStart(2, '0')}`;
  }

  get hp(): number { return this.getField('hp'); }
  set hp(v: number) { this.setField('hp', v); }
  get atk(): number { return this.getField('atk'); }
  set atk(v: number) { this.setField('atk', v); }
  get def(): number { return this.getField('def'); }
  set def(v: number) { this.setField('def', v); }
  get speed(): number { return this.getField('speed'); }
  set speed(v: number) { this.setField('speed', v); }
  get collisionPlane(): number { return this.getField('collisionPlane'); }
  set collisionPlane(v: number) { this.setField('collisionPlane', v); }
  get level(): number { return this.getField('level'); }
  set level(v: number) { this.setField('level', v); }
  get poison(): boolean { return this.getField('poison') !== 0; }
  set poison(v: boolean) { this.setField('poison', v ? 1 : 0); }
  /** Ad-hoc spawn index for this object's spawned child, if any. */
  get child(): number { return this.getField('child'); }
  set child(v: number) { this.setField('child', v); }
  get terrainSusceptibility(): number { return this.getField('terrainSusceptibility'); }
  set terrainSusceptibility(v: number) { this.setField('terrainSusceptibility', v); }
  /** Whether this object can be knocked back. */
  get immobile(): boolean { return this.getField('immobile') !== 0; }
  set immobile(v: boolean) { this.setField('immobile', v ? 1 : 0); }
  /** Object id this one turns into (e.g. slime element transformations). */
  get replacement(): number { return this.getField('replacement'); }
  set replacement(v: number) { this.setField('replacement', v); }
  get goldDrop(): number { return this.getField('goldDrop'); }
  set goldDrop(v: number) { this.setField('goldDrop', v); }
  get elements(): number { return this.getField('elements'); }
  set elements(v: number) { this.setField('elements', v); }
  get expReward(): number { return this.getField('expReward'); }
  set expReward(v: number) { this.setField('expReward', v); }
  get attackType(): number { return this.getField('attackType'); }
  set attackType(v: number) { this.setField('attackType', v); }
  get statusEffect(): number { return this.getField('statusEffect'); }
  set statusEffect(v: number) { this.setField('statusEffect', v); }

  /** True if `field` occupies a byte in this object's ROM record. */
  editable(field: Field): boolean {
    return this.slotOffsets[FIELDS[field].slot] != null;
  }

  private getField(field: Field): number {
    const {slot, mask, shift} = FIELDS[field];
    return (this.data[slot] & mask) >>> shift;
  }

  private setField(field: Field, value: number) {
    const {slot, mask, shift} = FIELDS[field];
    if (this.slotOffsets[slot] == null) {
      throw new Error(
          `Object $${hex(this.id)} has no ${field} slot in its ROM record.`);
    }
    const bits = (value << shift) & mask;
    this.data[slot] = (this.data[slot] & ~mask) | bits;
  }

  /** Write every present slot back to its original byte offset. */
  write(prg: Uint8Array) {
    for (let slot = 0; slot < this.slotOffsets.length; slot++) {
      const off = this.slotOffsets[slot];
      if (off != null) prg[off] = this.data[slot];
    }
  }
}

export class Objects {
  private readonly all: ObjectData[] = [];

  constructor(prg: Uint8Array) {
    for (let id = 0; id < 0x100; id++) this.all.push(new ObjectData(prg, id));
  }

  get(id: number): ObjectData | null {
    return this.all[id & 0xff] ?? null;
  }

  /** Write every object's mutated stat slots back into `prg`, in place. */
  write(prg: Uint8Array) {
    for (const obj of this.all) obj.write(prg);
  }
}

/** One line of NPC dialogue: shown when `condition` holds (0x3ff-masked id,
 *  negated meaning "must be clear"; `0` always holds for local entries - the
 *  ROM has no way to express that for global ones, see `Npc.globalDialogs`),
 *  referencing a message and a list of flags the game sets/clears once it's
 *  shown. `updateAction` is an NPC-behavior byte that follows local entries;
 *  it isn't interpreted or editable here, just preserved across edits. */
export interface DialogEntry {
  condition: number;
  message: MessageRef;
  flags: number[];
  updateAction: number;
}

/**
 * A talking NPC: its four-byte appearance record, per-location visibility
 * requirements, and dialogue tree.
 *
 * Dialogue is fully editable: `globalDialogs`/`localDialogs` are mutated
 * directly (push/splice/reassign fields), then `Npcs.write` re-encodes and
 * repacks every NPC with dialogue back into `NPC_DIALOG_ARENA`. Only line
 * content can change - the set of locations with an override, and whether
 * an NPC has dialogue at all, are fixed by `hasDialogPtr`/the key set of
 * `localDialogs`, since the ROM format has no spare room to add either.
 */
export class Npc {
  readonly base: number;
  /** `[giveItemSlot2, giveItemSlot1, ?, metaspriteBase]`. Slots 0/1 are the
   *  item ids granted by dialogue `updateAction` 0x03/0x11 respectively (read
   *  from RAM `$680,x`/`$6a0,x`, per vanilla `PersonData` - see
   *  `RomModifications.md`). */
  readonly data: number[];
  readonly name: string;

  /** Flag requirements keyed by location id. Every requirement must match for
   *  this NPC to appear there; a missing location means always visible. */
  readonly visibility = new Map<number, number[]>();

  /** Whether this id owns a usable pointer slot in the visibility table. */
  readonly hasVisibilityPtr: boolean;

  /** Dialogue shown regardless of location, checked before any local entry.
   *  A real global entry never uses `condition === 0` - the ROM's "no
   *  global dialogue" marker is a single condition-0 terminator entry with
   *  no visible effect, so it's dropped on parse and re-synthesized on
   *  write whenever this list is empty. */
  readonly globalDialogs: DialogEntry[] = [];
  /** Dialogue keyed by location id; `-1` is the shared default used when the
   *  NPC has no per-location override. Never has both a `-1` entry and real
   *  location ids at once - the byte format can't express that, and this
   *  key set never changes after parsing (see class comment). */
  readonly localDialogs = new Map<number, DialogEntry[]>();

  /** Whether this id had a real (non-empty) dialogue pointer when parsed;
   *  only these are re-encoded by `Npcs.write` - there's no supported way
   *  to add dialogue to an NPC that started with none. */
  readonly hasDialogPtr: boolean;

  constructor(prg: Uint8Array, readonly id: number) {
    // Banks $04/$05 are both identity-mapped, so one formula covers all ids.
    this.base = PRG_NPC_DATA | ((id & 0xfc) << 6) | ((id & 3) << 2);
    this.data = tuple(prg, this.base, 4);
    this.name = npcName(id);

    this.hasVisibilityPtr = supportsNpcVisibility(id) &&
        this.parseVisibility(prg, readLE16(prg, PRG_NPC_VISIBILITY_PTRS + id * 2));

    let hasDialogPtr = false;
    if (id < NUM_NPC_DIALOG_IDS) {
      const ptr = readLE16(prg, PRG_NPC_DIALOG_PTRS + id * 2);
      if (ptr && ptr !== NPC_DIALOG_EMPTY_PTR) {
        hasDialogPtr = true;
        this.parseDialog(prg, ptr + NPC_DIALOG_PTR_DELTA);
      }
    }
    this.hasDialogPtr = hasDialogPtr;
  }

  /** Item id granted by dialogue action 0x03 ("Give item (slot 2)"). */
  get giveItemSlot2(): number { return this.data[0]; }
  set giveItemSlot2(v: number) { this.data[0] = v & 0xff; }

  /** Item id granted by dialogue action 0x11 ("Give item (slot 1)"). */
  get giveItemSlot1(): number { return this.data[1]; }
  set giveItemSlot1(v: number) { this.data[1] = v & 0xff; }

  /** Base metasprite id; the low two bits select the facing direction. */
  get metaspriteBase(): number { return this.data[3]; }
  set metaspriteBase(v: number) { this.data[3] = v & 0xff; }

  /** Write the mutated data bytes back to their ROM offsets. */
  write(prg: Uint8Array) {
    prg[this.base] = this.data[0];
    prg[this.base + 1] = this.data[1];
    prg[this.base + 3] = this.data[3];
  }

  get displayName(): string {
    return this.name || `NPC $${this.id.toString(16).padStart(2, '0')}`;
  }

  get hasDialog(): boolean {
    return this.globalDialogs.length > 0 || this.localDialogs.size > 0;
  }

  /** Encode the location/flag table terminated by `$ff`. Empty condition
   *  lists are omitted because absence is the ROM's "always visible" form. */
  encodeVisibilityBlob(): number[] {
    const bytes: number[] = [];
    for (const [location, conditions] of this.visibility) {
      if (!conditions.length) continue;
      bytes.push(location & 0xff);
      conditions.forEach((signed, index) => {
        const clear = signed < 0;
        const flag = clear ? ~signed : signed;
        if (flag < 0 || flag > 0x3ff) {
          throw new RangeError(
              `${this.displayName}: visibility flag ${flag} is outside $000-$3ff.`);
        }
        let hi = flag >>> 8;
        if (clear) hi |= 0x20;
        if (index === conditions.length - 1) hi |= 0x80;
        bytes.push(hi, flag & 0xff);
      });
    }
    bytes.push(0xff);
    return bytes;
  }

  /** Dialogue for a specific location, falling back to the shared default
   *  (key `-1`) when this NPC has no override for that location. */
  dialogsForLocation(locationId: number): DialogEntry[] {
    return this.localDialogs.get(locationId) ?? this.localDialogs.get(-1) ?? [];
  }

  private parseDialog(prg: Uint8Array, start: number) {
    let a = start;
    while (true) {
      const word = (prg[a] << 8) | prg[a + 1];
      const condition = word & 0x2000 ? ~(word & 0x03ff) : word & 0x03ff;
      const message = readDialogMessage(prg, a + 2);
      a += 4;
      if (condition) this.globalDialogs.push({condition, message, flags: [], updateAction: 0});
      if (word & 0x8000) break;
    }

    // Per-location dialogue offset table, terminated by $ff.
    const locations: Array<[number, number]> = [];
    while (true) {
      const loc = prg[a++];
      if (loc === 0xff) break;
      locations.push([loc, prg[a++]]);
    }
    const base = a;
    const targets: Array<[number, number]> = locations.length ? locations : [[-1, 0]];

    for (const [loc, offset] of targets) {
      const entries: DialogEntry[] = [];
      let p = base + offset;
      while (true) {
        const word = (prg[p] << 8) | prg[p + 1];
        const condition = word & 0x2000 ? ~(word & 0x03ff) : word & 0x03ff;
        const message = readDialogMessage(prg, p + 2);
        const updateAction = prg[p + 4];
        p += 5; // condition word (2) + message (2) + "update" action byte (1)
        let flags: number[] = [];
        if (word & 0x4000) ({flags, next: p} = readDialogFlags(prg, p));
        entries.push({condition, message, flags, updateAction});
        if (word & 0x8000) break;
      }
      this.localDialogs.set(loc, entries);
    }
  }

  private parseVisibility(prg: Uint8Array, pointer: number): boolean {
    if (!pointer) return false;
    let offset = pointer + NPC_VISIBILITY_PTR_DELTA;
    if (offset < NPC_VISIBILITY_ARENA[0] || offset >= NPC_VISIBILITY_ARENA[1]) {
      return false;
    }
    while (offset < NPC_VISIBILITY_ARENA[1]) {
      const location = prg[offset++];
      if (location === 0xff) return true;
      const conditions: number[] = [];
      while (offset + 1 < NPC_VISIBILITY_ARENA[1]) {
        const hi = prg[offset++];
        const lo = prg[offset++];
        const flag = (hi & 0x03) << 8 | lo;
        conditions.push(hi & 0x20 ? ~flag : flag);
        if (hi & 0x80) break;
      }
      if (!conditions.length || !(prg[offset - 2] & 0x80)) return false;
      this.visibility.set(location, conditions);
    }
    return false;
  }

  /**
   * Re-encode this NPC's full dialogue tree as bytes, self-contained except
   * for its own final placement in `NPC_DIALOG_ARENA` (the caller repoints
   * the pointer table after packing). Throws if a per-location block's
   * offset from the start of local data would exceed the format's one-byte
   * limit (255) - vanilla leaves no slack for this, so a section that grows
   * a lot can hit it.
   */
  encodeDialogBlob(): number[] {
    const bytes: number[] = [];
    if (this.globalDialogs.length === 0) {
      // The ROM's "no global dialogue" marker: a single terminator entry
      // whose condition (0) never holds.
      bytes.push(0x80, 0x00, 0x00, 0x00);
    } else {
      this.globalDialogs.forEach((entry, i) => {
        bytes.push(...encodeGlobalEntry(entry, i === this.globalDialogs.length - 1));
      });
    }

    const sections = [...this.localDialogs.entries()];
    const implicit = sections.length === 1 && sections[0][0] === -1;
    const blocks = sections.map(([, entries]) => encodeLocalBlock(entries));

    if (implicit) {
      bytes.push(0xff);
    } else {
      // Sections with byte-identical dialogue (e.g. two locations sharing
      // the same lines) share one copy - vanilla does this pervasively and
      // leaves no spare room in this table without it.
      let offset = 0;
      const offsetByContent = new Map<string, number>();
      const uniqueBlocks: number[][] = [];
      const offsets = blocks.map(block => {
        const key = block.join(',');
        const existing = offsetByContent.get(key);
        if (existing != null) return existing;
        const at = offset;
        offsetByContent.set(key, at);
        uniqueBlocks.push(block);
        offset += block.length;
        return at;
      });
      sections.forEach(([loc], i) => {
        if (offsets[i] > 0xff) {
          throw new Error(
              `${this.displayName}'s dialogue is too long: the block for ` +
              `location $${hex(loc)} starts ${offsets[i]} bytes in, past ` +
              `this format's 255-byte limit. Shorten an earlier location's ` +
              `dialogue to make room.`);
        }
        bytes.push(loc & 0xff, offsets[i]);
      });
      bytes.push(0xff);
      for (const block of uniqueBlocks) bytes.push(...block);
      return bytes;
    }
    for (const block of blocks) bytes.push(...block);
    return bytes;
  }
}

/** Message reference bytes, same 2-byte part/index layout as `Trigger`'s
 *  (see `readDialogMessage` for the reverse). */
function encodeDialogMessage(message: MessageRef): [number, number] {
  return [(message.part >> 3) & 0x07, ((message.part & 7) << 5) | (message.index & 0x1f)];
}

/** Signed 10-bit condition/flag id packed the way `parseDialog`/
 *  `readDialogFlags` expect: magnitude in the low 10 bits, sign bit set for
 *  negative (clear/must-be-clear) values. */
function packSigned10(value: number): {magnitude: number, negative: boolean} {
  const negative = value < 0;
  return {magnitude: (negative ? ~value : value) & 0x03ff, negative};
}

function encodeGlobalEntry(entry: DialogEntry, last: boolean): number[] {
  const {magnitude, negative} = packSigned10(entry.condition);
  let word = magnitude;
  if (negative) word |= 0x2000;
  if (last) word |= 0x8000;
  return [word >>> 8, word & 0xff, ...encodeDialogMessage(entry.message)];
}

function encodeLocalBlock(entries: DialogEntry[]): number[] {
  const bytes: number[] = [];
  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    const {magnitude, negative} = packSigned10(entry.condition);
    let word = magnitude;
    if (negative) word |= 0x2000;
    if (entry.flags.length) word |= 0x4000;
    if (last) word |= 0x8000;
    bytes.push(word >>> 8, word & 0xff, ...encodeDialogMessage(entry.message), entry.updateAction & 0xff);
    entry.flags.forEach((flag, j) => {
      const {magnitude: flagMag, negative: flagNeg} = packSigned10(flag);
      let hi = (flagMag >>> 8) & 0x03;
      if (flagNeg) hi |= 0x80;
      if (j === entry.flags.length - 1) hi |= 0x40;
      bytes.push(hi, flagMag & 0xff);
    });
  });
  return bytes;
}

/** Message reference bytes, same 2-byte part/index layout as `Trigger`'s. */
function readDialogMessage(prg: Uint8Array, offset: number): MessageRef {
  const mb0 = prg[offset];
  const mb1 = prg[offset + 1];
  return {part: ((mb0 & 0x07) << 3) | ((mb1 & 0xe0) >>> 5), index: mb1 & 0x1f};
}

/** A variable-length flag list following a local dialogue entry: pairs of
 *  bytes, high bit of the first byte's top nibble marks sign/terminator. A
 *  lone padding entry (10 bits all set, sign bit on) decodes to `-1` and is
 *  dropped rather than treated as a real "always clear" flag. */
function readDialogFlags(prg: Uint8Array, offset: number): {flags: number[], next: number} {
  const flags: number[] = [];
  while (true) {
    const hi = prg[offset];
    const lo = prg[offset + 1];
    offset += 2;
    const flag = (hi & 3) << 8 | lo;
    const signed = hi & 0x80 ? ~flag : flag;
    if (signed !== -1) flags.push(signed);
    if (hi & 0x40) return {flags, next: offset};
  }
}

export class Npcs {
  private readonly all: Npc[] = [];

  constructor(prg: Uint8Array) {
    for (let id = 0; id < 0x100; id++) this.all.push(new Npc(prg, id));
  }

  get(id: number): Npc | null {
    return this.all[id & 0xff] ?? null;
  }

  /** Named NPCs with a real appearance, for sprite pickers. */
  list(): Npc[] {
    return this.all.filter(n => n.name && n.metaspriteBase);
  }

  /**
   * Write every NPC's mutated appearance byte back into `prg`, in place,
   * then re-encode and repack the visibility and dialogue regions when their
   * respective dirty flags are set. Structural edits change byte lengths, so
   * each uses a full fixed-arena repack; on failure a warning makes the caller
   * discard the whole attempted build.
   */
  write(prg: Uint8Array, visibilityDirty: boolean, dialogDirty: boolean,
        warnings: string[]) {
    for (const npc of this.all) npc.write(prg);
    if (visibilityDirty) this.writeVisibility(prg, warnings);
    if (warnings.length) return;
    if (!dialogDirty) return;

    const dialogNpcs = this.all.filter(n => n.hasDialogPtr);
    const blobs: Array<{npc: Npc, bytes: number[]}> = [];
    for (const npc of dialogNpcs) {
      try {
        blobs.push({npc, bytes: npc.encodeDialogBlob()});
      } catch (e) {
        warnings.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (warnings.length) return;

    // Vanilla leaves essentially no free space in this table - it relies on
    // NPCs whose dialogue tree is a byte-for-byte suffix of a longer NPC's
    // tree (e.g. sharing a location/local-dialogue tail while differing
    // only in their own global dialogue) pointing straight into that
    // longer tree's tail rather than owning separate bytes. Without
    // reproducing that, even a no-op rewrite of every NPC doesn't fit.
    const byLengthDesc = [...blobs].sort((a, b) => b.bytes.length - a.bytes.length);
    const roots: number[][] = [];
    const placement = new Map<Npc, {root: number[], tailStart: number}>();
    for (const {npc, bytes} of byLengthDesc) {
      const host = roots.find(root => isSuffix(bytes, root));
      if (host) {
        placement.set(npc, {root: host, tailStart: host.length - bytes.length});
      } else {
        roots.push(bytes);
        placement.set(npc, {root: bytes, tailStart: 0});
      }
    }

    const packer = new Packer([{start: NPC_DIALOG_ARENA[0], end: NPC_DIALOG_ARENA[1]}]);
    const failure = packer.placeAll(roots);
    if (failure) {
      warnings.push(
          `NPC dialogue data is full: ${packer.capacity} bytes total, ` +
          `${packer.remaining} free, and a ${failure.length}-byte dialogue ` +
          `block does not fit. Shorten dialogue elsewhere to make room. ` +
          `No changes were written.`);
      return;
    }
    for (const root of roots) prg.set(root, packer.offsetOf(root)!);
    for (const {npc} of blobs) {
      const {root, tailStart} = placement.get(npc)!;
      const offset = packer.offsetOf(root)! + tailStart;
      writeLE16(prg, PRG_NPC_DIALOG_PTRS + npc.id * 2, offset - NPC_DIALOG_PTR_DELTA);
    }
  }


  private writeVisibility(prg: Uint8Array, warnings: string[]) {
    const entries: Array<{npc: Npc, bytes: number[]}> = [];
    for (const npc of this.all) {
      if (!npc.hasVisibilityPtr) continue;
      try {
        entries.push({npc, bytes: npc.encodeVisibilityBlob()});
      } catch (e) {
        warnings.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (warnings.length) return;

    // Vanilla heavily shares identical tables. Suffix sharing is also safe:
    // every blob is self-terminating, so a pointer may begin inside a longer
    // blob at a complete trailing table (especially the single-byte `$ff`
    // "always" table).
    const byLengthDesc = [...entries].sort((a, b) => b.bytes.length - a.bytes.length);
    const roots: number[][] = [];
    const placement = new Map<Npc, {root: number[], tailStart: number}>();
    for (const {npc, bytes} of byLengthDesc) {
      const host = roots.find(root => isSuffix(bytes, root));
      if (host) {
        placement.set(npc, {root: host, tailStart: host.length - bytes.length});
      } else {
        roots.push(bytes);
        placement.set(npc, {root: bytes, tailStart: 0});
      }
    }

    const packer = new Packer([
      {start: NPC_VISIBILITY_ARENA[0], end: NPC_VISIBILITY_ARENA[1]},
    ]);
    const failure = packer.placeAll(roots);
    if (failure) {
      warnings.push(
          `NPC visibility data is full: ${packer.capacity} bytes total, ` +
          `${packer.remaining} free, and a ${failure.length}-byte visibility ` +
          `block does not fit. Remove conditions elsewhere to make room. ` +
          `No changes were written.`);
      return;
    }
    for (const root of roots) prg.set(root, packer.offsetOf(root)!);
    for (const {npc} of entries) {
      const {root, tailStart} = placement.get(npc)!;
      const offset = packer.offsetOf(root)! + tailStart;
      writeLE16(prg, PRG_NPC_VISIBILITY_PTRS + npc.id * 2,
                offset - NPC_VISIBILITY_PTR_DELTA);
    }
    for (const tail of packer.tails()) prg.fill(0xff, tail.start, tail.end);
  }
}

/** Vanilla only provides safe visibility-pointer slots for these NPC ranges;
 *  the gap is occupied by unrelated tables despite the logical id indexing. */
function supportsNpcVisibility(id: number): boolean {
  return id <= 0x88 || id === 0x8e || (id >= 0xc0 && id <= 0xcc);
}
