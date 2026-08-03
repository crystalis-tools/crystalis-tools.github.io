import {INES_HEADER_SIZE, MAPDATA_ARENA, MAPDATA_PTR_DELTA, NPCDATA_ARENA,
        NPCDATA_PTR_DELTA, PRG_LOCATION_FLAGS, PRG_MAPDATA_PTRS,
        PRG_NPCDATA_PTRS, PRG_SIZE} from './constants';
import {crc32, hex, writeLE16} from './bytes';
import {ENGINE_TWEAKS} from './enginetweaks';
import {ItemIcons} from './itemicons';
import {ItemStats} from './itemdata';
import {ItemNames} from './itemnames';
import {Location, parseLocations} from './location';
import {Messages} from './messages';
import {Metasprites} from './metasprite';
import {Npcs, Objects} from './objects';
import {Palettes} from './palette';
import {Patterns} from './pattern';
import {Screens} from './screen';
import {Shops} from './shop';
import {Tilesets} from './tileset';
import {ProjectSettings} from './projectsettings';
import {Triggers} from './trigger';
import {Arena, Chunk, Packer, mergeRanges} from './writer';

export interface RomInfo {
  /** File name the user opened. */
  fileName: string;
  /** Byte length of the full file including the header. */
  size: number;
  /** CRC32 of the PRG image as loaded. */
  crc: number;
  hasHeader: boolean;
  prgBanks: number;
  chrBanks: number;
}

export interface BuildResult {
  /** False when validation or allocation failed and `rom` is unchanged. */
  ok: boolean;
  rom: Uint8Array;
  log: string[];
  warnings: string[];
}

/**
 * Regions of the map-data banks that hold something other than location data
 * and must never be handed out by the allocator.
 */
const RESERVED: readonly Chunk[] = [
  {start: 0x14000, end: 0x14300},                       // extended screens
  {start: PRG_MAPDATA_PTRS, end: PRG_MAPDATA_PTRS + 0x200},
  {start: PRG_NPCDATA_PTRS - 1, end: PRG_NPCDATA_PTRS + 0x200},
];

export class Rom {
  readonly prg: Uint8Array;
  readonly chr: Uint8Array;

  readonly locations: Location[];
  readonly screens: Screens;
  readonly tilesets: Tilesets;
  readonly patterns: Patterns;
  readonly palettes: Palettes;
  readonly metasprites: Metasprites;
  readonly objects: Objects;
  readonly npcs: Npcs;
  readonly shops: Shops;
  readonly itemNames: ItemNames;
  readonly itemIcons: ItemIcons;
  readonly itemStats: ItemStats;
  readonly triggers: Triggers;
  readonly messages: Messages;
  readonly projectSettings: ProjectSettings;

  /** Set when a shop editor mutates `shops`; unlike locations this table is
   *  always rewritten in place, so this only drives the "modified" UI badge. */
  shopsDirty = false;

  /** Set when the enemies editor mutates `objects`; always rewritten in
   *  place, same as shops, so this only drives the "modified" UI badge. */
  objectsDirty = false;

  /** Set when the NPCs editor mutates `npcs`; always rewritten in place,
   *  same as shops, so this only drives the "modified" UI badge. */
  npcsDirty = false;

  /** Set when the items editor mutates `itemIcons`; always rewritten in
   *  place, same as shops, so this only drives the "modified" UI badge. */
  itemIconsDirty = false;

  /** Set when the items editor mutates `itemStats`; always rewritten in
   *  place, same as shops, so this only drives the "modified" UI badge. */
  itemStatsDirty = false;

  /** Set when the items editor mutates `itemNames`; always rewritten in
   *  place, same as shops, so this only drives the "modified" UI badge. */
  itemNamesDirty = false;

  /** Set when shared fixed tables such as screens or tilesets are edited. */
  sharedDataDirty = false;

  /** Set when editor-only project metadata changes. Project settings are
   *  stored in the BPS metadata field and never written into the ROM image. */
  projectDirty = false;

  /** Set when the messages editor mutates `messages`; edited text is
   *  relocated on write if it outgrows its original span, so this only
   *  drives the "modified" UI badge. */
  messagesDirty = false;

  /** Set when the script editor mutates an NPC's dialogue tree; unlike
   *  `npcsDirty` (the appearance byte) this actually gates a rewrite -
   *  dialogue is always fully repacked on build, so skipping it when clean
   *  avoids needless BPS diff churn. */
  npcDialogDirty = false;

  /** Set when the NPC editor mutates per-location appearance requirements;
   *  these variable-length records are fully repacked on build. */
  npcVisibilityDirty = false;

  /** Set when the script editor mutates a trigger's conditions/message/
   *  flags; like `npcDialogDirty`, gates a full repack of the (extremely
   *  tightly packed) trigger data table. */
  triggersDirty = false;

  /** Untouched copy of the file as loaded, used as the BPS source. */
  readonly original: Uint8Array;

  /** The working image (header + PRG + CHR) that edits are written into. */
  private readonly image: Uint8Array;

  /** `original`, sliced to just the PRG region - lets Engine Tweaks restore
   *  their vanilla bytes without having to cache them separately. */
  private readonly originalPrg: Uint8Array;

  readonly info: RomInfo;

  private constructor(file: Uint8Array, fileName: string, originalOverride?: Uint8Array) {
    this.original = (originalOverride ?? file).slice();
    const hasHeader = file[0] === 0x4e && file[1] === 0x45 &&
                      file[2] === 0x53 && file[3] === 0x1a;
    const headerSize = hasHeader ? INES_HEADER_SIZE : 0;
    const image = file.slice();
    this.prg = image.subarray(headerSize, headerSize + PRG_SIZE);
    this.chr = image.subarray(headerSize + PRG_SIZE);
    this.image = image;
    this.originalPrg = this.original.subarray(headerSize, headerSize + PRG_SIZE);

    this.info = {
      fileName,
      size: file.length,
      crc: crc32(this.prg),
      hasHeader,
      prgBanks: hasHeader ? file[4] : Math.floor(this.prg.length / 0x4000),
      chrBanks: hasHeader ? file[5] : Math.floor(this.chr.length / 0x2000),
    };

    this.locations = parseLocations(this.prg);
    this.screens = new Screens(this.prg);
    this.tilesets = new Tilesets(this.prg);
    this.patterns = new Patterns(this.chr);
    this.palettes = new Palettes(this.prg);
    this.metasprites = new Metasprites(this.prg);
    this.objects = new Objects(this.prg);
    this.npcs = new Npcs(this.prg);
    this.shops = new Shops(this.prg, this.locations, this.objects);
    this.itemNames = new ItemNames(this.prg);
    this.itemIcons = new ItemIcons(this.prg);
    this.itemStats = new ItemStats(this.prg);
    this.triggers = new Triggers(this.prg);
    this.messages = new Messages(this.prg, this.itemNames);
    this.projectSettings = new ProjectSettings();
  }

  /**
   * Parse `file` into a Rom. `originalOverride`, when given, becomes
   * `Rom.original` (the BPS diff source) instead of `file` itself — used when
   * loading a BPS patch on top of an already-loaded vanilla ROM, so exports
   * keep diffing against the true vanilla bytes rather than the patched ones.
   */
  static load(file: Uint8Array, fileName: string, originalOverride?: Uint8Array): Rom {
    const hasHeader = file[0] === 0x4e && file[1] === 0x45 &&
                      file[2] === 0x53 && file[3] === 0x1a;
    if (hasHeader) {
      if (file[6] & 0x04) {
        throw new Error('ROMs with an iNES trainer are not supported.');
      }
      const prgSize = file[4] * 0x4000;
      const chrSize = file[5] * 0x2000;
      if (prgSize !== PRG_SIZE) {
        throw new Error(
            `Expected ${PRG_SIZE} bytes of PRG ROM, header declares ${prgSize}.`);
      }
      const expected = INES_HEADER_SIZE + prgSize + chrSize;
      if (file.length < expected) {
        throw new Error(
            `File is truncated: header declares ${expected} bytes, ` +
            `but the file has ${file.length}.`);
      }
    } else if (file.length < PRG_SIZE) {
      throw new Error(`File is only ${file.length} bytes; not a Crystalis ROM.`);
    }
    const rom = new Rom(file, fileName, originalOverride);
    if (rom.usedLocations.length === 0) {
      throw new Error('No Crystalis location data was found in this file.');
    }
    return rom;
  }

  /** Locations that actually exist in the ROM, in id order. */
  get usedLocations(): Location[] {
    return this.locations.filter(l => l.used);
  }

  location(id: number): Location {
    return this.locations[id & 0xff];
  }

  /** Engine Tweaks, each with its current on/off state. The state itself
   *  lives in `projectSettings` (BPS metadata) rather than `prg` directly -
   *  tweaks are only baked into ROM bytes at build time - so an id with no
   *  metadata entry yet (freshly loaded ROM, or an older patch predating
   *  this tweak) falls back to whatever the loaded bytes currently say. */
  get engineTweaks(): Array<{id: string, name: string, description: string, enabled: boolean}> {
    return ENGINE_TWEAKS.map(t => ({
      id: t.id, name: t.name, description: t.description,
      enabled: this.projectSettings.engineTweaks[t.id] ?? t.isEnabled(this.prg),
    }));
  }

  setEngineTweak(id: string, enabled: boolean) {
    if (!ENGINE_TWEAKS.some(t => t.id === id)) return;
    this.projectSettings.engineTweaks[id] = enabled;
    this.projectDirty = true;
  }

  /** Applies every Engine Tweak's stored on/off state to `prg` (a build's
   *  working copy, not the live `this.prg`), restoring vanilla bytes from
   *  `originalPrg` for anything left disabled. */
  private applyEngineTweaks(prg: Uint8Array) {
    for (const tweak of ENGINE_TWEAKS) {
      const enabled = this.projectSettings.engineTweaks[tweak.id] ?? tweak.isEnabled(this.prg);
      tweak.setEnabled(prg, this.originalPrg, enabled);
    }
  }

  get dirty(): boolean {
    return this.sharedDataDirty || this.shopsDirty || this.objectsDirty ||
           this.npcsDirty || this.itemIconsDirty || this.itemStatsDirty ||
           this.itemNamesDirty || this.projectDirty || this.messagesDirty ||
           this.npcDialogDirty || this.npcVisibilityDirty || this.triggersDirty ||
           this.locations.some(l => l.dirty);
  }

  markClean() {
    for (const loc of this.locations) loc.dirty = false;
    this.shopsDirty = false;
    this.objectsDirty = false;
    this.npcsDirty = false;
    this.itemIconsDirty = false;
    this.itemStatsDirty = false;
    this.itemNamesDirty = false;
    this.sharedDataDirty = false;
    this.projectDirty = false;
    this.messagesDirty = false;
    this.npcDialogDirty = false;
    this.npcVisibilityDirty = false;
    this.triggersDirty = false;
  }

  // ------------------------------------------------------------------ build

  /**
   * Produce an updated ROM image.  Every subsystem writes itself back; map
   * data is rewritten in place where possible and relocated where not.
   */
  build(): BuildResult {
    const incremental = this.attemptBuild(false);
    if (!incremental.needsCompaction) {
      return this.finishBuild(incremental);
    }
    // Something outgrew its slot and the padding-derived free list could not
    // absorb it.  Vanilla packs these banks tight, so fall back to repacking
    // every location's data over the bytes location data already owns.
    const compacted = this.attemptBuild(true);
    return this.finishBuild(compacted);
  }

  /** Failed builds are atomic: callers receive the untouched loaded image. */
  private finishBuild(result: {
    rom: Uint8Array;
    log: string[];
    warnings: string[];
  }): BuildResult {
    const ok = result.warnings.length === 0;
    return {
      ok,
      rom: ok ? result.rom : this.image.slice(),
      log: result.log,
      warnings: result.warnings,
    };
  }

  private attemptBuild(compact: boolean) {
    const log: string[] = [];
    const warnings: string[] = [];

    const out = this.image.slice();
    const headerSize = this.info.hasHeader ? INES_HEADER_SIZE : 0;
    const prg = out.subarray(headerSize, headerSize + PRG_SIZE);
    const chr = out.subarray(headerSize + PRG_SIZE);

    // Non-relocatable subsystems write straight into their fixed tables.
    this.applyEngineTweaks(prg);
    this.screens.write(prg);
    this.tilesets.write(prg);
    this.palettes.write(prg);
    this.patterns.write(chr);
    this.shops.write(prg);
    this.objects.write(prg);
    this.npcs.write(prg, this.npcVisibilityDirty, this.npcDialogDirty, warnings);
    this.triggers.write(prg, this.triggersDirty, warnings);
    this.itemIcons.write(prg);
    this.itemStats.write(prg);
    this.itemNames.write(prg);
    warnings.push(...this.messages.write(prg));

    const writable: Location[] = [];
    for (const loc of this.locations) {
      if (!loc.used) continue;
      const problems = loc.validate();
      if (problems.length) {
        if (loc.dirty) {
          warnings.push(`$${hex(loc.id)} ${loc.label}: ` +
                        `${problems.join('; ')} - skipped`);
        }
        continue;
      }
      writable.push(loc);
    }

    for (const loc of writable) {
      if (!loc.dirty && !compact) continue;
      prg[PRG_LOCATION_FLAGS | loc.id] =
          (loc.checkpoint ? 0x80 : 0) | (loc.saveable ? 0x01 : 0);
    }

    if (compact) {
      this.compactAll(prg, writable, log, warnings);
      return {rom: out, log, warnings, needsCompaction: false};
    }

    const {mapArena, npcArena} = this.buildArenas(prg);
    const shared = this.sharedBlocks();
    const sharedNpcData = this.sharedNpcData();
    let needsCompaction = false;

    for (const loc of writable) {
      if (!loc.dirty) continue;
      if (!this.writeMapData(prg, loc, mapArena, shared, log)) {
        needsCompaction = true;
        break;
      }
      if (!this.writeNpcData(prg, loc, npcArena, sharedNpcData, log)) {
        needsCompaction = true;
        break;
      }
    }

    if (!needsCompaction) {
      log.push(`Map data padding free: ${mapArena.available} bytes ` +
               `(largest run ${mapArena.largest})`);
      log.push(`NPC data padding free: ${npcArena.available} bytes ` +
               `(largest run ${npcArena.largest})`);
    }
    return {rom: out, log, warnings, needsCompaction};
  }

  /**
   * Repack every location's MapData and NpcData into the byte ranges vanilla
   * already devotes to location data, sharing identical blocks.  Nothing
   * outside those ranges is touched, so the unrelated tables that also live in
   * these banks survive.
   */
  private compactAll(prg: Uint8Array, locations: readonly Location[],
                     log: string[], warnings: string[]) {
    log.push('Compacting: repacking all location data.');

    const mapChunks: Chunk[] = [];
    const npcChunks: Chunk[] = [];
    for (const loc of locations) {
      mapChunks.push({start: loc.extent.mapDataStart, end: loc.extent.mapDataEnd});
      if (loc.extent.npcDataStart) {
        npcChunks.push({start: loc.extent.npcDataStart, end: loc.extent.npcDataEnd});
      }
    }

    const mapPacker = new Packer(mapChunks);
    const npcPacker = new Packer(npcChunks);

    // Blocks are placed as one batch so the packer can order them largest
    // first; headers follow, since they need the block offsets.
    const blocksByLocation = new Map<Location, number[][]>();
    const allBlocks: number[][] = [];
    for (const loc of locations) {
      const blocks = loc.mapDataBlocks();
      blocksByLocation.set(loc, blocks);
      allBlocks.push(...blocks);
    }
    const blockFailure = mapPacker.placeAll(allBlocks);
    if (blockFailure) {
      warnings.push(
          `Map data banks are full: ${mapPacker.capacity} bytes total, ` +
          `${mapPacker.remaining} free, and a ${blockFailure.length}-byte ` +
          `block does not fit. Shrink a map to make room. ` +
          `No changes were written.`);
      return;
    }

    const headers = new Map<Location, number[]>();
    for (const loc of locations) {
      const offsets = blocksByLocation.get(loc)!
          .map(block => mapPacker.offsetOf(block)!);
      headers.set(loc, Location.mapDataHeader(offsets));
    }
    const headerFailure = mapPacker.placeAll([...headers.values()]);
    if (headerFailure) {
      warnings.push(
          `Map data banks are full: no room for a ${headerFailure.length}-byte ` +
          `MapData header, ${mapPacker.remaining} bytes free. ` +
          `No changes were written.`);
      return;
    }

    const npcBlobs = new Map<Location, number[]>();
    for (const loc of locations) {
      const blob = loc.serializeNpcData();
      if (blob) npcBlobs.set(loc, [...blob]);
    }
    const npcFailure = npcPacker.placeAll([...npcBlobs.values()]);
    if (npcFailure) {
      warnings.push(
          `NPC data banks are full: ${npcPacker.capacity} bytes total, ` +
          `${npcPacker.remaining} free, and a ${npcFailure.length}-byte spawn ` +
          `table does not fit. Vanilla leaves almost no slack here - remove ` +
          `spawns elsewhere to make room. No changes were written.`);
      return;
    }

    // Everything fits; commit.
    for (const loc of locations) {
      const blocks = blocksByLocation.get(loc)!;
      for (const block of blocks) {
        prg.set(block, mapPacker.offsetOf(block)!);
      }
      const header = headers.get(loc)!;
      const headerOffset = mapPacker.offsetOf(header)!;
      prg.set(header, headerOffset);
      writeLE16(prg, loc.mapDataPointer, headerOffset - MAPDATA_PTR_DELTA);

      const blob = npcBlobs.get(loc);
      if (blob) {
        const npcOffset = npcPacker.offsetOf(blob)!;
        prg.set(blob, npcOffset);
        writeLE16(prg, loc.npcDataPointer, npcOffset - NPCDATA_PTR_DELTA);
      }
    }
    for (const tail of [...mapPacker.tails(), ...npcPacker.tails()]) {
      prg.fill(0xff, tail.start, tail.end);
    }

    log.push(`Map data: ${mapPacker.allocated}/${mapPacker.capacity} bytes ` +
             `used, ${mapPacker.remaining} free`);
    log.push(`NPC data: ${npcPacker.allocated}/${npcPacker.capacity} bytes ` +
             `used, ${npcPacker.remaining} free`);
  }

  private writeMapData(prg: Uint8Array, loc: Location, arena: Arena,
                       shared: Set<number>, log: string[]): boolean {
    const size = loc.mapDataSize();
    const {mapDataStart, mapDataEnd} = loc.extent;
    const capacity = mapDataEnd - mapDataStart;
    const exclusive = !loc.extent.blocks.some(b => shared.has(b)) &&
                      !this.overlapsOtherLocation(loc);

    let base = mapDataStart;
    if (exclusive && size <= capacity) {
      // Reuse the slot; hand any tail back to the allocator.
      if (size < capacity) arena.free(mapDataStart + size, mapDataEnd);
      log.push(`$${hex(loc.id)} ${loc.label}: map data in place at ` +
               `$${hex(base, 5)} (${size}/${capacity} bytes)`);
    } else {
      const allocated = arena.alloc(size);
      if (allocated == null) return false;
      base = allocated;
      if (exclusive) arena.free(mapDataStart, mapDataEnd);
      log.push(`$${hex(loc.id)} ${loc.label}: map data relocated to ` +
               `$${hex(base, 5)} (${size} bytes)`);
    }

    prg.set(loc.serializeMapData(base), base);
    writeLE16(prg, loc.mapDataPointer, base - MAPDATA_PTR_DELTA);
    return true;
  }

  private writeNpcData(prg: Uint8Array, loc: Location, arena: Arena,
                       shared: Set<number>, log: string[]): boolean {
    const blob = loc.serializeNpcData();
    if (!blob) return true;
    const {npcDataStart, npcDataEnd} = loc.extent;
    const capacity = npcDataStart ? npcDataEnd - npcDataStart : 0;
    const exclusive = npcDataStart !== 0 && !shared.has(npcDataStart);

    let base = npcDataStart;
    if (exclusive && blob.length <= capacity) {
      if (blob.length < capacity) arena.free(npcDataStart + blob.length, npcDataEnd);
    } else {
      const allocated = arena.alloc(blob.length);
      if (allocated == null) return false;
      base = allocated;
      if (exclusive) arena.free(npcDataStart, npcDataEnd);
      log.push(`$${hex(loc.id)} ${loc.label}: NPC data relocated to ` +
               `$${hex(base, 5)} (${blob.length} bytes)`);
    }

    prg.set(blob, base);
    writeLE16(prg, loc.npcDataPointer, base - NPCDATA_PTR_DELTA);
    return true;
  }

  /** Block offsets referenced by more than one location. */
  private sharedBlocks(): Set<number> {
    const counts = new Map<number, number>();
    for (const loc of this.locations) {
      if (!loc.used) continue;
      for (const block of loc.extent.blocks) {
        counts.set(block, (counts.get(block) ?? 0) + 1);
      }
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([b]) => b));
  }

  /** NpcData offsets referenced by more than one location. */
  private sharedNpcData(): Set<number> {
    const counts = new Map<number, number>();
    for (const loc of this.locations) {
      if (!loc.used || !loc.extent.npcDataStart) continue;
      const start = loc.extent.npcDataStart;
      counts.set(start, (counts.get(start) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([start]) => start));
  }

  /** True if another location's data lives inside this one's extent. */
  private overlapsOtherLocation(loc: Location): boolean {
    const {mapDataStart, mapDataEnd} = loc.extent;
    for (const other of this.locations) {
      if (other === loc || !other.used) continue;
      for (const block of other.extent.blocks) {
        if (block >= mapDataStart && block < mapDataEnd) return true;
      }
      const start = other.extent.mapDataStart;
      if (start >= mapDataStart && start < mapDataEnd) return true;
    }
    return false;
  }

  private buildArenas(prg: Uint8Array) {
    const used: Chunk[] = [...RESERVED];
    for (const loc of this.locations) {
      if (!loc.used) continue;
      used.push({start: loc.extent.mapDataStart, end: loc.extent.mapDataEnd});
      if (loc.extent.npcDataStart) {
        used.push({start: loc.extent.npcDataStart, end: loc.extent.npcDataEnd});
      }
    }
    const merged = mergeRanges(used);

    const mapArena = new Arena('mapdata', MAPDATA_ARENA[0], MAPDATA_ARENA[1]);
    const npcArena = new Arena('npcdata', NPCDATA_ARENA[0], NPCDATA_ARENA[1]);
    mapArena.seedFromPadding(prg, merged);
    npcArena.seedFromPadding(prg, merged);
    return {mapArena, npcArena};
  }
}
