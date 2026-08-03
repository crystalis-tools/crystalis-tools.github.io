import {MAPDATA_PTR_DELTA, NPCDATA_PTR_DELTA, NUM_LOCATIONS,
        PRG_LOCATION_FLAGS, PRG_MAPDATA_PTRS, PRG_NPCDATA_PTRS,
        SCREEN_PX_HEIGHT, SCREEN_PX_WIDTH} from './constants';
import {readLE16, seq, tuple, varSlice} from './bytes';
import {Entrance, Exit, Flag, Pit, Spawn} from './locationtables';
import {locationLabel, locationGroup, locationName} from './nametables';

/** Byte ranges a location's data occupies, used by the free-space allocator. */
export interface LocationExtent {
  /** Start of the MapData pointer header. */
  mapDataStart: number;
  /** One past the last byte of MapData owned by this location. */
  mapDataEnd: number;
  /** Start of NpcData, or 0 if the location has none. */
  npcDataStart: number;
  npcDataEnd: number;
  /** Offsets of each individual MapData block, for shared-block detection. */
  blocks: number[];
}

export class Location {
  readonly name: string;
  readonly label: string;
  readonly group: string;

  /** False for the ~40 unused slots in the location table. */
  used = false;

  bgm = 0;
  /** Stored as width-1 in the ROM; this is the real screen count. */
  width = 1;
  height = 1;
  animation = 0;
  /** 0 for the base screen plane, 0x100 for the extended plane. */
  plane = 0;

  /** `screens[y][x]` is a screen id (already OR'd with `plane`). */
  screens: number[][] = [[0]];

  tilePalettes: [number, number, number] = [0x24, 0x01, 0x26];
  tileset = 0x80;
  tileEffects = 0xb3;
  tilePatterns: [number, number] = [2, 4];

  entrances: Entrance[] = [];
  exits: Exit[] = [];
  flags: Flag[] = [];
  pits: Pit[] = [];

  spritePalettes: [number, number] = [0, 0];
  spritePatterns: [number, number] = [0, 0];
  spawns: Spawn[] = [];

  checkpoint = false;
  saveable = false;

  /** Set when any editor mutates this location. */
  dirty = false;

  /** Where the location's data lived when the ROM was loaded. */
  extent: LocationExtent = {
    mapDataStart: 0, mapDataEnd: 0, npcDataStart: 0, npcDataEnd: 0, blocks: [],
  };

  constructor(readonly id: number) {
    this.name = locationName(id);
    this.label = locationLabel(id);
    this.group = locationGroup(id);
  }

  get mapDataPointer(): number {
    return PRG_MAPDATA_PTRS + (this.id << 1);
  }

  get npcDataPointer(): number {
    return PRG_NPCDATA_PTRS + (this.id << 1);
  }

  /** Pixel width of the composed map. */
  get pxWidth(): number { return this.width * SCREEN_PX_WIDTH; }
  get pxHeight(): number { return this.height * SCREEN_PX_HEIGHT; }

  /** Screen id at screen-grid position, or 0 if out of range. */
  screenAt(x: number, y: number): number {
    return this.screens[y]?.[x] ?? 0;
  }

  setScreenAt(x: number, y: number, id: number) {
    if (!this.screens[y]) return;
    this.screens[y][x] = id;
    this.dirty = true;
  }

  /** Flag record covering the given screen, if any. */
  flagAt(x: number, y: number): Flag | undefined {
    return this.flags.find(f => f.screenX === x && f.screenY === y);
  }

  /** Resize the screen grid, preserving overlapping cells. */
  resize(width: number, height: number, fill = 0) {
    const next = seq(height, y => seq(width, x => this.screens[y]?.[x] ?? (fill | this.plane)));
    this.screens = next;
    this.width = width;
    this.height = height;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- parsing

  static parse(prg: Uint8Array, id: number): Location {
    const loc = new Location(id);
    const mapPtr = readLE16(prg, loc.mapDataPointer);
    const mapDataBase = mapPtr + MAPDATA_PTR_DELTA;
    loc.used = mapPtr > 0 && !!loc.name;
    if (!loc.used) return loc;

    const layoutBase = readLE16(prg, mapDataBase) + MAPDATA_PTR_DELTA;
    const graphicsBase = readLE16(prg, mapDataBase + 2) + MAPDATA_PTR_DELTA;
    const entrancesBase = readLE16(prg, mapDataBase + 4) + MAPDATA_PTR_DELTA;
    const exitsBase = readLE16(prg, mapDataBase + 6) + MAPDATA_PTR_DELTA;
    const flagsBase = readLE16(prg, mapDataBase + 8) + MAPDATA_PTR_DELTA;

    // The exits list is terminated by a byte with bit 7 set, which also encodes
    // whether a pits pointer follows the five fixed pointers and how many
    // entrance records precede the exits.
    let hasPits = layoutBase !== mapDataBase + 10;
    let entranceLen = exitsBase - entrancesBase;
    let exitsEnd = exitsBase;
    {
      let i = exitsBase;
      while (i < prg.length && !(prg[i] & 0x80)) {
        if (i + Exit.size > prg.length) {
          throw new RangeError(
              `Location $${id.toString(16)} has a truncated exits table.`);
        }
        if (prg[i + 2] !== 0xff) loc.exits.push(new Exit(tuple(prg, i, 4)));
        i += 4;
      }
      if (i >= prg.length) {
        throw new RangeError(
            `Location $${id.toString(16)} has no exits terminator.`);
      }
      if (prg[i] !== 0xff) {
        hasPits = Boolean(prg[i] & 0x40);
        entranceLen = (prg[i] & 0x1f) << 2;
      }
      exitsEnd = i + 1;
    }

    const pitsBase =
        hasPits ? readLE16(prg, mapDataBase + 10) + MAPDATA_PTR_DELTA : 0;

    loc.bgm = prg[layoutBase];
    loc.width = prg[layoutBase + 1] + 1;
    loc.height = prg[layoutBase + 2] + 1;
    loc.animation = prg[layoutBase + 3];
    loc.plane = prg[layoutBase + 4] ? 0x100 : 0;
    loc.screens = seq(loc.height, y =>
        tuple(prg, layoutBase + 5 + y * loc.width, loc.width)
            .map(s => loc.plane | s));

    loc.tilePalettes = tuple(prg, graphicsBase, 3) as [number, number, number];
    loc.tileset = prg[graphicsBase + 3];
    loc.tileEffects = prg[graphicsBase + 4];
    loc.tilePatterns = tuple(prg, graphicsBase + 5, 2) as [number, number];

    for (let i = 0; i < entranceLen; i += 4) {
      loc.entrances.push(new Entrance(tuple(prg, entrancesBase + i, 4)));
    }
    loc.flags = varSlice(prg, flagsBase, 2, 0xff).map(d => new Flag(d));
    const flagsEnd = flagsBase + loc.flags.length * 2 + 1;

    let pitsEnd = 0;
    if (pitsBase) {
      loc.pits = varSlice(prg, pitsBase, 4, 0xff).map(d => new Pit(d));
      // varSlice stopped on an $ff, which belongs to this block as its
      // terminator - count it so the extent covers what we would rewrite.
      pitsEnd = pitsBase + loc.pits.length * 4 + 1;
    }

    const npcPtr = readLE16(prg, loc.npcDataPointer);
    const npcDataBase = npcPtr + NPCDATA_PTR_DELTA;
    let npcDataEnd = 0;
    if (npcPtr !== 0) {
      loc.spritePalettes = tuple(prg, npcDataBase + 1, 2) as [number, number];
      loc.spritePatterns = tuple(prg, npcDataBase + 3, 2) as [number, number];
      loc.spawns = varSlice(prg, npcDataBase + 5, 4, 0xff).map(d => new Spawn(d));
      npcDataEnd = npcDataBase + 5 + loc.spawns.length * 4 + 1;
    }

    const flagByte = prg[PRG_LOCATION_FLAGS | id];
    loc.checkpoint = Boolean(flagByte & 0x80);
    loc.saveable = Boolean(flagByte & 0x01);

    const layoutEnd = layoutBase + 5 + loc.width * loc.height;
    const blocks = [layoutBase, graphicsBase, entrancesBase, exitsBase, flagsBase];
    if (pitsBase) blocks.push(pitsBase);
    loc.extent = {
      mapDataStart: mapDataBase,
      mapDataEnd: Math.max(mapDataBase + (hasPits ? 12 : 10), layoutEnd,
                           graphicsBase + 7, entrancesBase + entranceLen,
                           exitsEnd, flagsEnd, pitsEnd),
      npcDataStart: npcPtr !== 0 ? npcDataBase : 0,
      npcDataEnd,
      blocks,
    };
    return loc;
  }

  // ------------------------------------------------------------ serializing

  /** True when a pits pointer follows the five fixed MapData pointers. */
  get hasPits(): boolean {
    return this.pits.length > 0;
  }

  /** Byte length of this location's MapData pointer header. */
  get mapDataHeaderSize(): number {
    return this.hasPits ? 12 : 10;
  }

  /**
   * The MapData blocks in pointer order: layout, graphics, entrances, exits,
   * flags and - when present - pits.  The compacting writer places these
   * individually so identical blocks can be shared between locations, exactly
   * as vanilla does.
   */
  mapDataBlocks(): number[][] {
    const blocks: number[][] = [
      [
        this.bgm, this.width - 1, this.height - 1, this.animation,
        this.plane ? 0x80 : 0,
        ...this.screens.flat().map(s => s & 0xff),
      ],
      [...this.tilePalettes, this.tileset, this.tileEffects,
       ...this.tilePatterns],
      this.entrances.flatMap(e => e.data),
      [
        ...this.exits.flatMap(e => e.data),
        0x80 | (this.hasPits ? 0x40 : 0) | (this.entrances.length & 0x1f),
      ],
      [...this.flags.flatMap(f => f.data), 0xff],
    ];
    if (this.hasPits) {
      blocks.push([...this.pits.flatMap(p => p.data), 0xff]);
    }
    return blocks;
  }

  /** Build a pointer header from already-placed block offsets. */
  static mapDataHeader(blockOffsets: readonly number[]): number[] {
    const out: number[] = [];
    for (const offset of blockOffsets) {
      const ptr = offset - MAPDATA_PTR_DELTA;
      out.push(ptr & 0xff, ptr >>> 8 & 0xff);
    }
    return out;
  }

  /**
   * Serialize MapData as one self-contained blob: a pointer header followed by
   * every block it references.  Pointers are relative to `base`, so the caller
   * must know the destination offset before calling.
   */
  serializeMapData(base: number): Uint8Array {
    const blocks = this.mapDataBlocks();
    const offsets: number[] = [];
    let cursor = base + this.mapDataHeaderSize;
    for (const block of blocks) {
      offsets.push(cursor);
      cursor += block.length;
    }
    return Uint8Array.from(
        [...Location.mapDataHeader(offsets), ...blocks.flat()]);
  }

  /** Serialize NpcData, or null if this location has no spawn table. */
  serializeNpcData(): Uint8Array | null {
    if (!this.extent.npcDataStart && !this.spawns.length) return null;
    return Uint8Array.from([
      0, ...this.spritePalettes, ...this.spritePatterns,
      ...this.spawns.flatMap(s => (s.used ? s.data : [0xfe, 0, 0, 0])),
      0xff,
    ]);
  }

  /** Byte length `serializeMapData` will produce at any base. */
  mapDataSize(): number {
    return this.mapDataHeaderSize +
        this.mapDataBlocks().reduce((n, b) => n + b.length, 0);
  }

  /** Sanity problems that would corrupt the ROM if written. */
  validate(): string[] {
    const problems: string[] = [];
    if (this.width < 1 || this.width > 8) {
      problems.push(`width ${this.width} out of range 1..8`);
    }
    if (this.height < 1 || this.height > 16) {
      problems.push(`height ${this.height} out of range 1..16`);
    }
    if (this.entrances.length > 0x1f) {
      problems.push(`${this.entrances.length} entrances exceeds the 31 the ` +
                    `exit terminator can encode`);
    }
    for (const row of this.screens) {
      for (const s of row) {
        if ((s & 0x100) !== this.plane) {
          problems.push(`screen $${s.toString(16)} is not on plane ` +
                        `$${this.plane.toString(16)}`);
          break;
        }
      }
    }
    return problems;
  }
}

/** Parse every location slot in the ROM. */
export function parseLocations(prg: Uint8Array): Location[] {
  return seq(NUM_LOCATIONS, id => Location.parse(prg, id));
}
