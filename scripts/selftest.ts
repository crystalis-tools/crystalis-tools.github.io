/**
 * Byte-level self test for the ROM layer.
 *
 * There is no Crystalis ROM in this repo, so instead of testing against real
 * data we synthesize a PRG image with hand-laid MapData/NpcData structures,
 * then check that parsing, editing, building and re-parsing all agree.  Run
 * with `npm test`.
 */

import {applyBpsPatch, createBpsPatch, readBpsMetadata} from '../src/rom/bps';
import {crc32, readLE16, varSlice} from '../src/rom/bytes';
import {INES_HEADER_SIZE, MAPDATA_PTR_DELTA, NPCDATA_PTR_DELTA,
        NPC_VISIBILITY_PTR_DELTA, NUM_MESSAGE_PARTS, PRG_LOCATION_FLAGS,
        PRG_COMMON_WORDS, PRG_MAPDATA_PTRS, PRG_MESSAGE_BANKS, PRG_MESSAGE_PARTS,
        PRG_NPCDATA_PTRS, PRG_NPC_VISIBILITY_PTRS, PRG_OBJECT_PTRS,
        PRG_OBJECT_WINDOW, PRG_SIZE} from '../src/rom/constants';
import {Location} from '../src/rom/location';
import {Spawn} from '../src/rom/locationtables';
import {Rom} from '../src/rom/rom';
import {ProjectSettings} from '../src/rom/projectsettings';
import {Packer} from '../src/rom/writer';
import {createIdeStore} from '../src/state/store';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = '') {
  checks++;
  if (condition) return;
  failures++;
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
}

function eq<T>(name: string, actual: T, expected: T) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function throws(name: string, fn: () => void) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(name, threw);
}

// --------------------------------------------------------------- synthesis

interface FakeLocation {
  id: number;
  bgm: number;
  width: number;
  height: number;
  animation: number;
  plane: number;
  screens: number[];
  palettes: [number, number, number];
  tileset: number;
  effects: number;
  patterns: [number, number];
  entrances: number[][];
  exits: number[][];
  flags: number[][];
  pits: number[][];
  spawns: number[][];
  spritePalettes: [number, number];
  spritePatterns: [number, number];
}

/**
 * Write one location's MapData at `base` in the vanilla arrangement: a pointer
 * header immediately followed by each block.
 */
function writeMapData(prg: Uint8Array, loc: FakeLocation, base: number): number {
  const hasPits = loc.pits.length > 0;
  const headerSize = hasPits ? 12 : 10;
  const blocks: number[][] = [
    [loc.bgm, loc.width - 1, loc.height - 1, loc.animation,
     loc.plane ? 0x80 : 0, ...loc.screens],
    [...loc.palettes, loc.tileset, loc.effects, ...loc.patterns],
    loc.entrances.flat(),
    [...loc.exits.flat(), 0x80 | (hasPits ? 0x40 : 0) | loc.entrances.length],
    [...loc.flags.flat(), 0xff],
  ];
  if (hasPits) blocks.push([...loc.pits.flat(), 0xff]);

  let cursor = base + headerSize;
  for (let i = 0; i < blocks.length; i++) {
    const ptr = cursor - MAPDATA_PTR_DELTA;
    prg[base + i * 2] = ptr & 0xff;
    prg[base + i * 2 + 1] = ptr >>> 8;
    prg.set(blocks[i], cursor);
    cursor += blocks[i].length;
  }
  const mapPtr = base - MAPDATA_PTR_DELTA;
  prg[PRG_MAPDATA_PTRS + loc.id * 2] = mapPtr & 0xff;
  prg[PRG_MAPDATA_PTRS + loc.id * 2 + 1] = mapPtr >>> 8;
  return cursor;
}

function writeNpcData(prg: Uint8Array, loc: FakeLocation, base: number): number {
  const bytes = [0, ...loc.spritePalettes, ...loc.spritePatterns,
                 ...loc.spawns.flat(), 0xff];
  prg.set(bytes, base);
  const ptr = base - NPCDATA_PTR_DELTA;
  prg[PRG_NPCDATA_PTRS + loc.id * 2] = ptr & 0xff;
  prg[PRG_NPCDATA_PTRS + loc.id * 2 + 1] = ptr >>> 8;
  return base + bytes.length;
}

function writeNpcVisibility(prg: Uint8Array): void {
  // Leaf Elder appears in Leaf only while flag $085 is clear.
  const id = 0x0d;
  const base = 0x1c780;
  prg.set([LEAF.id, 0xa0, 0x85, 0xff], base);
  const ptr = base - NPC_VISIBILITY_PTR_DELTA;
  prg[PRG_NPC_VISIBILITY_PTRS + id * 2] = ptr & 0xff;
  prg[PRG_NPC_VISIBILITY_PTRS + id * 2 + 1] = ptr >>> 8;
}

/** Lay out one message and the 34-part pointer structure used to reach it. */
function writeTestMessages(prg: Uint8Array): void {
  const emptyPartTable = PRG_MESSAGE_BANKS;
  const oneMessagePartTable = emptyPartTable - 2;

  for (let part = 0; part < NUM_MESSAGE_PARTS; part++) {
    const table = part === 0 ? oneMessagePartTable : emptyPartTable;
    const ptr = table - 0x20000;
    prg[PRG_MESSAGE_PARTS + part * 2] = ptr & 0xff;
    prg[PRG_MESSAGE_PARTS + part * 2 + 1] = ptr >>> 8;
    prg[PRG_MESSAGE_BANKS + part] = 0x15;
  }

  const messageOffset = 0x2a000;
  const messagePtr = messageOffset - 0x20000;
  prg[oneMessagePartTable] = messagePtr & 0xff;
  prg[oneMessagePartTable + 1] = messagePtr >>> 8;
  prg.set([1, ...Buffer.from('This message has enough room.'), 0], messageOffset);

  // Common dictionary entry $80 -> "This".
  const commonWordOffset = 0x2b000;
  const commonWordPtr = commonWordOffset - 0x20000;
  prg[PRG_COMMON_WORDS] = commonWordPtr & 0xff;
  prg[PRG_COMMON_WORDS + 1] = commonWordPtr >>> 8;
  prg.set([...Buffer.from('This'), 0], commonWordOffset);
}

/** Location $02 is "Leaf" in the ported name table, so the slot is used. */
const LEAF: FakeLocation = {
  id: 0x02,
  bgm: 0x11,
  width: 2,
  height: 3,
  animation: 0x04,
  plane: 0,
  screens: [0x10, 0x11, 0x12, 0x13, 0x14, 0x15],
  palettes: [0x24, 0x01, 0x26],
  tileset: 0x80,
  effects: 0xb3,
  patterns: [0x02, 0x04],
  entrances: [[0x40, 0x00, 0x50, 0x01], [0x80, 0x01, 0x20, 0x00]],
  exits: [[0x13, 0x21, 0x1c, 0x00], [0x14, 0x21, 0x1c, 0x01]],
  flags: [[0x2a, 0x10]],
  pits: [],
  spawns: [[0x88, 0x27, 0x01, 0x0d], [0x90, 0x35, 0x00, 0x5c]],
  spritePalettes: [0x30, 0x31],
  spritePatterns: [0x50, 0x51],
};

/** Location $04 "SealedCave1" exercises the pits pointer. */
const CAVE: FakeLocation = {
  id: 0x04,
  bgm: 0x22,
  width: 1,
  height: 1,
  animation: 0,
  plane: 0x100,
  screens: [0x40],
  palettes: [0x1a, 0x1b, 0x1c],
  tileset: 0x88,
  effects: 0xb5,
  patterns: [0x14, 0x15],
  entrances: [[0x10, 0x00, 0x10, 0x00]],
  exits: [[0x05, 0x06, 0x02, 0x00]],
  flags: [],
  pits: [[0x03, 0x12, 0x00, 0x34]],
  spawns: [],
  spritePalettes: [0, 0],
  spritePatterns: [0, 0],
};

/** Object id given a hand-laid ObjectData record, for editable-stat tests. */
const TEST_OBJECT_ID = 0x50;
/** ObjectData's window covers PRG $10000-$1ffff; put the record just past the
 *  NpcData arena, well clear of anything else `buildFakeRom` writes. */
const TEST_OBJECT_BASE = 0x1c100;

/** Slots 0 (metasprite), 6 (hp), 7 (atk), 8 (def) present; all other groups
 *  empty. Mask bits are MSB-first per slot within a group of eight. */
function writeTestObject(prg: Uint8Array): void {
  const ptr = TEST_OBJECT_BASE - PRG_OBJECT_WINDOW;
  prg[PRG_OBJECT_PTRS + TEST_OBJECT_ID * 2] = ptr & 0xff;
  prg[PRG_OBJECT_PTRS + TEST_OBJECT_ID * 2 + 1] = ptr >>> 8;

  const bytes = [
    0x07,             // sfx
    0x80 | 0x02 | 0x01, // group 0 mask: slots 0, 6, 7 present
    0x22,             // slot 0: metasprite
    0x64,             // slot 6: hp
    0x14,             // slot 7: atk
    0x80,             // group 1 mask: slot 8 present
    0x08,             // slot 8: def
    0x00, 0x00,       // masks for groups 2-3: nothing present
  ];
  prg.set(bytes, TEST_OBJECT_BASE);
}

function buildFakeRom(): Uint8Array {
  const file = new Uint8Array(INES_HEADER_SIZE + PRG_SIZE + 0x20000);
  file.set([0x4e, 0x45, 0x53, 0x1a, 0x10, 0x10], 0);
  const prg = file.subarray(INES_HEADER_SIZE, INES_HEADER_SIZE + PRG_SIZE);

  // Fill the map-data banks with $ff so the allocator sees free padding, then
  // carve out the two locations at the start of segment $0b.
  prg.fill(0xff, 0x14000, 0x1c000);
  // Zero the pointer tables so unused slots parse as unused.
  prg.fill(0, PRG_MAPDATA_PTRS, PRG_MAPDATA_PTRS + 0x200);
  prg.fill(0, PRG_NPCDATA_PTRS, PRG_NPCDATA_PTRS + 0x200);
  prg.fill(0, PRG_NPC_VISIBILITY_PTRS, PRG_NPC_VISIBILITY_PTRS + 0x200);

  let cursor = 0x16000;
  cursor = writeMapData(prg, LEAF, cursor);
  cursor = writeMapData(prg, CAVE, cursor);
  let npcCursor = 0x18000;
  npcCursor = writeNpcData(prg, LEAF, npcCursor);
  writeNpcData(prg, CAVE, npcCursor);

  prg[PRG_LOCATION_FLAGS | LEAF.id] = 0x81;
  prg[PRG_LOCATION_FLAGS | CAVE.id] = 0x00;

  // Distinctive screen data so screen parsing is observable.
  for (let id = 0x10; id <= 0x15; id++) {
    for (let i = 0; i < 0xf0; i++) prg[(id << 8) + i] = (id + i) & 0xff;
  }

  writeTestObject(prg);
  writeNpcVisibility(prg);
  writeTestMessages(prg);

  return file;
}

// -------------------------------------------------------------------- tests

function testParse(rom: Rom) {
  const leaf = rom.location(LEAF.id);
  check('leaf is used', leaf.used);
  eq('leaf name', leaf.name, 'Leaf');
  eq('leaf bgm', leaf.bgm, LEAF.bgm);
  eq('leaf size', [leaf.width, leaf.height], [LEAF.width, LEAF.height]);
  eq('leaf animation', leaf.animation, LEAF.animation);
  eq('leaf screens', leaf.screens, [[0x10, 0x11], [0x12, 0x13], [0x14, 0x15]]);
  eq('leaf palettes', leaf.tilePalettes, LEAF.palettes);
  eq('leaf tileset', leaf.tileset, LEAF.tileset);
  eq('leaf tile effects', leaf.tileEffects, LEAF.effects);
  eq('leaf patterns', leaf.tilePatterns, LEAF.patterns);
  eq('leaf entrance count', leaf.entrances.length, 2);
  eq('leaf exit count', leaf.exits.length, 2);
  eq('leaf flag count', leaf.flags.length, 1);
  eq('leaf flag id', leaf.flags[0].flag, 0x22a);
  eq('leaf pit count', leaf.pits.length, 0);
  eq('leaf spawn count', leaf.spawns.length, 2);
  eq('leaf sprite palettes', leaf.spritePalettes, LEAF.spritePalettes);
  eq('leaf checkpoint/saveable', [leaf.checkpoint, leaf.saveable], [true, true]);

  const cave = rom.location(CAVE.id);
  check('cave is used', cave.used);
  eq('cave plane', cave.plane, 0x100);
  eq('cave screens', cave.screens, [[0x140]]);
  eq('cave pit count', cave.pits.length, 1);
  eq('cave pit dest', cave.pits[0].dest, 0x03);
  eq('cave pit from', [cave.pits[0].fromXs, cave.pits[0].fromYs], [1, 3]);
  eq('cave pit to', [cave.pits[0].toXs, cave.pits[0].toYs], [2, 4]);
  eq('cave spawn count', cave.spawns.length, 0);

  const unused = rom.location(0x0b);
  check('slot $0b is unused', !unused.used);

  // Screen tiles come straight out of PRG at id << 8.
  eq('screen $10 first tiles', rom.screens.get(0x10).tiles.slice(0, 3),
     [0x10, 0x11, 0x12]);

  // Derived spawn geometry.
  const spawn = leaf.spawns[0];
  eq('spawn type', spawn.type, 1);
  eq('spawn id', spawn.id, 0x0d);
  eq('spawn tile coords', [spawn.xt, spawn.yt], [0x27, 0x88]);
  eq('spawn pixel coords', [spawn.px, spawn.py],
     [0x2 * 256 + 7 * 16, 0x8 * 240 + 8 * 16]);
}

/** Parse -> serialize -> parse must be a fixed point. */
function testRoundTrip(rom: Rom) {
  for (const loc of rom.usedLocations) {
    const bytes = loc.serializeMapData(loc.extent.mapDataStart);
    eq(`mapDataSize matches serialization for $${loc.id.toString(16)}`,
       bytes.length, loc.mapDataSize());
    check(`$${loc.id.toString(16)} fits its original slot`,
          bytes.length <= loc.extent.mapDataEnd - loc.extent.mapDataStart,
          `${bytes.length} > ${loc.extent.mapDataEnd - loc.extent.mapDataStart}`);
  }

  // No edits: build must reproduce the input byte for byte.
  const untouched = rom.build();
  eq('clean build is byte-identical', crc32(untouched.rom), crc32(rom.original));
  eq('clean build has no warnings', untouched.warnings, []);
}

function testEditInPlace(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const leaf = rom.location(LEAF.id);
  leaf.bgm = 0x2a;
  leaf.setScreenAt(1, 1, 0x77);
  leaf.dirty = true;

  const result = rom.build();
  eq('edit build has no warnings', result.warnings, []);

  const reloaded = Rom.load(result.rom, 'test.nes');
  const reparsed = reloaded.location(LEAF.id);
  eq('bgm survives round trip', reparsed.bgm, 0x2a);
  eq('screen edit survives round trip', reparsed.screens[1][1], 0x77);
  eq('other screens unchanged', reparsed.screens[0], [0x10, 0x11]);
  eq('exits survive', reparsed.exits.map(e => e.data), LEAF.exits);
  eq('spawns survive', reparsed.spawns.map(s => s.data), LEAF.spawns);
  eq('flags survive', reparsed.flags.map(f => f.data), LEAF.flags);

  // Data stayed in the slot it started in.
  eq('map data pointer unchanged',
     readLE16(reloaded.prg, reparsed.mapDataPointer),
     readLE16(rom.prg, leaf.mapDataPointer));

  // The untouched location must be bit-identical.
  const cave = reloaded.location(CAVE.id);
  eq('untouched location keeps its pits', cave.pits.map(p => p.data), CAVE.pits);
  eq('untouched location keeps its plane', cave.plane, 0x100);
}

function testMessageEncoding(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  rom.messages.set(0, 0, 'A\nB\n\nC\n\n\nD');

  const result = rom.build();
  eq('message edit build has no warnings', result.warnings, []);

  const messageOffset = INES_HEADER_SIZE + 0x2a000;
  eq('message writer preserves line breaks before page controls',
     Array.from(result.rom.subarray(messageOffset, messageOffset + 12)),
     [1, 65, 2, 66, 3, 1, 67, 2, 3, 1, 68, 0]);

  const reloaded = Rom.load(result.rom, 'test.nes');
  eq('edited message survives round trip', reloaded.messages.get(0, 0),
     'A\nB\n\nC\n\n\nD');

  const compressed = Rom.load(file, 'test.nes');
  compressed.messages.set(0, 0, 'This is This.');
  const compressedResult = compressed.build();
  eq('dictionary-compressed message bytes',
     Array.from(compressedResult.rom.subarray(messageOffset, messageOffset + 8)),
     [1, 0x80, 0x69, 0x73, 0x20, 0x80, 0x2e, 0]);
  const compressedReloaded = Rom.load(compressedResult.rom, 'test.nes');
  eq('compressed message survives round trip',
     compressedReloaded.messages.get(0, 0), 'This is This.');

  const compressedLines = Rom.load(file, 'test.nes');
  compressedLines.messages.set(0, 0, 'This\nThis\n\nThis');
  const compressedLinesResult = compressedLines.build();
  eq('dictionary tokens compose with line and page controls',
     Array.from(compressedLinesResult.rom.subarray(messageOffset, messageOffset + 9)),
     [1, 0x80, 2, 0x80, 3, 1, 0x80, 0, 0x73]);
  eq('compressed controls survive round trip without trailing spaces',
     Rom.load(compressedLinesResult.rom, 'test.nes').messages.get(0, 0),
     'This\nThis\n\nThis');
}

function testEditWithGrowth(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const leaf = rom.location(LEAF.id);
  const originalPtr = readLE16(rom.prg, leaf.mapDataPointer);

  // Grow the map well past its original slot, forcing relocation.
  leaf.resize(8, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) leaf.screens[y][x] = (y * 8 + x) & 0xff;
  }
  leaf.exits.push(new (leaf.exits[0].constructor as any)([0x20, 0x30, 0x05, 0x00]));

  const result = rom.build();
  eq('growth build has no warnings', result.warnings, []);

  const reloaded = Rom.load(result.rom, 'test.nes');
  const reparsed = reloaded.location(LEAF.id);
  check('grown location was relocated',
        readLE16(reloaded.prg, reparsed.mapDataPointer) !== originalPtr);
  eq('grown size', [reparsed.width, reparsed.height], [8, 16]);
  eq('grown screens row 3', reparsed.screens[3],
     [24, 25, 26, 27, 28, 29, 30, 31]);
  eq('grown exit count', reparsed.exits.length, 3);
  eq('grown exit dest', reparsed.exits[2].dest, 0x05);
  eq('grown entrances intact', reparsed.entrances.map(e => e.data),
     LEAF.entrances);

  // Relocation must land inside the map-data banks.
  const base = readLE16(reloaded.prg, reparsed.mapDataPointer) + MAPDATA_PTR_DELTA;
  check('relocated inside segments $0a/$0b',
        base >= 0x14000 && base < 0x18000, `base = ${base.toString(16)}`);

  // And the neighbouring location must survive untouched.
  const cave = reloaded.location(CAVE.id);
  eq('neighbour bgm intact', cave.bgm, CAVE.bgm);
  eq('neighbour pit intact', cave.pits.map(p => p.data), CAVE.pits);
}

function testSpawnGrowth(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const leaf = rom.location(LEAF.id);
  const SpawnClass = leaf.spawns[0].constructor as any;
  for (let i = 0; i < 20; i++) {
    leaf.spawns.push(new SpawnClass([0x30 + i, 0x22, 0x00, 0x40 + i]));
  }
  leaf.dirty = true;

  const result = rom.build();
  eq('spawn growth has no warnings', result.warnings, []);

  const reparsed = Rom.load(result.rom, 'test.nes').location(LEAF.id);
  eq('spawn count after growth', reparsed.spawns.length, 22);
  eq('last spawn id', reparsed.spawns[21].id, 0x53);
  eq('sprite patterns intact', reparsed.spritePatterns, LEAF.spritePatterns);
}

/** Editing one of two locations that share NpcData must break the sharing. */
function testSharedNpcCopyOnWrite(file: Uint8Array) {
  const sharedFile = file.slice();
  const prg = sharedFile.subarray(INES_HEADER_SIZE, INES_HEADER_SIZE + PRG_SIZE);
  const leafPointer = readLE16(prg, PRG_NPCDATA_PTRS + LEAF.id * 2);
  prg[PRG_NPCDATA_PTRS + CAVE.id * 2] = leafPointer & 0xff;
  prg[PRG_NPCDATA_PTRS + CAVE.id * 2 + 1] = leafPointer >>> 8;

  const rom = Rom.load(sharedFile, 'shared.nes');
  const leaf = rom.location(LEAF.id);
  const cave = rom.location(CAVE.id);
  const originalPalette = cave.spritePalettes[0];
  leaf.spritePalettes[0] = originalPalette ^ 1;
  leaf.dirty = true;

  const result = rom.build();
  check('shared NpcData edit builds', result.ok);
  const reloaded = Rom.load(result.rom, 'shared.nes');
  eq('shared NpcData target changes',
     reloaded.location(LEAF.id).spritePalettes[0], originalPalette ^ 1);
  eq('shared NpcData neighbour stays unchanged',
     reloaded.location(CAVE.id).spritePalettes[0], originalPalette);
  check('shared NpcData target gets a private pointer',
        readLE16(reloaded.prg, PRG_NPCDATA_PTRS + LEAF.id * 2) !==
        readLE16(reloaded.prg, PRG_NPCDATA_PTRS + CAVE.id * 2));
}

/** Allocation failure must return the exact image that was originally loaded. */
function testFailedBuildIsAtomic(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const leaf = rom.location(LEAF.id);
  const template = leaf.spawns[0].data;
  for (let i = 0; i < 5000; i++) leaf.spawns.push(new Spawn([...template]));
  leaf.dirty = true;

  // Also mutate a fixed table, which is written before compaction is attempted.
  const screen = rom.screens.get(0x10);
  screen.tiles[0] ^= 0xff;
  rom.sharedDataDirty = true;

  const result = rom.build();
  check('overflow build reports failure', !result.ok);
  check('overflow build has a warning', result.warnings.length > 0);
  check('failed build returns untouched bytes',
        result.rom.length === rom.original.length &&
        result.rom.every((byte, i) => byte === rom.original[i]));
}

function testStoreTransactions(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const store = createIdeStore();
  store.setState({rom});
  store.getState().openLocation(LEAF.id);

  const loc = rom.location(LEAF.id);
  const tileset = rom.tilesets.get(loc.tileset);
  const beforeTile = tileset.tiles[0][0];
  store.getState().edit('Set CHR tile', () => {
    store.getState().touchTileset(loc.tileset);
    tileset.setQuadrant(0, 0, beforeTile ^ 1);
  });
  check('tileset edit is undoable', store.getState().canUndo);
  check('tileset edit marks shared data dirty',
        rom.sharedDataDirty && rom.dirty);
  store.getState().undo();
  eq('tileset undo restores data', tileset.tiles[0][0], beforeTile);
  check('tileset undo does not dirty shops', !rom.shopsDirty);
  store.getState().redo();
  eq('tileset redo restores edit', tileset.tiles[0][0], beforeTile ^ 1);

  const screen = rom.screens.get(0x10);
  const beforeScreen = screen.tiles[0];
  store.getState().edit('Paint tiles', () => {
    store.getState().touchScreen(0x10);
    screen.set(0, 0, beforeScreen ^ 1);
  });
  check('screen edit keeps shared dirty state', rom.sharedDataDirty);
  store.getState().undo();
  eq('screen undo restores data', screen.tiles[0], beforeScreen);

  const clean = Rom.load(file, 'test.nes');
  const locationStore = createIdeStore();
  locationStore.setState({rom: clean});
  locationStore.getState().openLocation(LEAF.id);
  locationStore.getState().edit('Set music', () => {
    clean.location(LEAF.id).bgm ^= 1;
  });
  locationStore.getState().undo();
  check('location undo does not dirty shops', !clean.shopsDirty);

  const shopRom = Rom.load(file, 'test.nes');
  const shopStore = createIdeStore();
  shopStore.setState({rom: shopRom});
  shopStore.getState().openShop({shopType: 'inn', town: 0});
  const beforePrice = shopRom.shops.inns[0].buyPrice;
  shopStore.getState().edit('Edit shop', () => {
    shopStore.getState().touchShops();
    shopRom.shops.inns[0].buyPrice = beforePrice + 1;
  });
  check('shop edit is undoable', shopStore.getState().canUndo);
  check('shop edit marks only shops dirty',
        shopRom.shopsDirty && !shopRom.sharedDataDirty);
  shopStore.getState().undo();
  eq('shop undo restores data', shopRom.shops.inns[0].buyPrice, beforePrice);

  const beforeItem = shopRom.shops.armorShops[0].contents[0];
  const nextItem = beforeItem === 0 ? 1 : 0;
  shopStore.getState().openShop({shopType: 'armor', town: 0});
  shopStore.getState().edit('Set shop item', () => {
    shopStore.getState().touchShops();
    shopRom.shops.armorShops[0].contents[0] = nextItem;
  });
  eq('shop item selection updates contents',
     shopRom.shops.armorShops[0].contents[0], nextItem);
  shopStore.getState().undo();
  eq('shop item selection is undoable',
     shopRom.shops.armorShops[0].contents[0], beforeItem);
}

function testObjectEdit(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const obj = rom.objects.get(TEST_OBJECT_ID)!;
  eq('seeded object hp', obj.hp, 0x64);
  eq('seeded object atk', obj.atk, 0x14);
  eq('seeded object def', obj.def, 0x08);
  eq('seeded object metasprite', obj.metasprite, 0x22);
  check('hp/atk/def are editable on the seeded object',
        obj.editable('hp') && obj.editable('atk') && obj.editable('def'));

  const untouched = rom.objects.get(TEST_OBJECT_ID + 1)!;
  check('an unseeded object has no editable stats', !untouched.editable('hp'));
  throws('setting a stat with no ROM slot throws', () => { untouched.hp = 5; });

  const store = createIdeStore();
  store.setState({rom});
  const beforeHp = obj.hp;
  store.getState().edit('Edit enemy stats', () => {
    store.getState().touchObjects();
    obj.hp = beforeHp + 5;
  });
  check('object edit is undoable', store.getState().canUndo);
  check('object edit marks only objects dirty',
        rom.objectsDirty && !rom.shopsDirty && !rom.sharedDataDirty);
  store.getState().undo();
  eq('object undo restores hp', obj.hp, beforeHp);
  store.getState().redo();
  eq('object redo reapplies hp', obj.hp, beforeHp + 5);

  obj.hp = 0x70;
  obj.atk = 0x21;
  obj.def = 0x09;
  const result = rom.build();
  eq('object edit build has no warnings', result.warnings, []);

  const reloaded = Rom.load(result.rom, 'test.nes');
  const reobj = reloaded.objects.get(TEST_OBJECT_ID)!;
  eq('hp survives round trip', reobj.hp, 0x70);
  eq('atk survives round trip', reobj.atk, 0x21);
  eq('def survives round trip', reobj.def, 0x09);
  eq('untouched slot survives round trip', reobj.metasprite, 0x22);
}

function testNpcVisibility(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const npc = rom.npcs.get(0x0d)!;
  check('seeded NPC has visibility pointer', npc.hasVisibilityPtr);
  eq('NPC visibility parses signed flag requirements',
     npc.visibility.get(LEAF.id), [~0x085]);

  const store = createIdeStore();
  store.setState({rom});
  store.getState().openNpc(npc.id);
  store.getState().edit('Edit NPC visibility', () => {
    store.getState().touchNpcVisibility(npc.id);
    npc.visibility.set(LEAF.id, [~0x085, 0x038]);
  });
  check('visibility edit is undoable', store.getState().canUndo);
  check('visibility edit marks only visibility data dirty',
        rom.npcVisibilityDirty && !rom.npcDialogDirty && !rom.npcsDirty);
  store.getState().undo();
  eq('visibility undo restores requirements', npc.visibility.get(LEAF.id), [~0x085]);
  store.getState().redo();
  eq('visibility redo restores edit', npc.visibility.get(LEAF.id), [~0x085, 0x038]);

  const result = rom.build();
  eq('visibility edit build has no warnings', result.warnings, []);
  const reloaded = Rom.load(result.rom, 'test.nes');
  eq('visibility edit survives round trip',
     reloaded.npcs.get(npc.id)!.visibility.get(LEAF.id), [~0x085, 0x038]);
}

function testMalformedInput(file: Uint8Array) {
  throws('truncated headered ROM is rejected',
         () => Rom.load(file.subarray(0, file.length - 1), 'truncated.nes'));

  const trainer = file.slice();
  trainer[6] |= 0x04;
  throws('trainer ROM is rejected', () => Rom.load(trainer, 'trainer.nes'));

  throws('unterminated record table is bounded',
         () => varSlice(new Uint8Array([1, 2, 3, 4]), 0, 2, 0xff));

  throws('unrecognized raw ROM is rejected',
         () => Rom.load(new Uint8Array(PRG_SIZE), 'zero.bin'));
}

function testPacker() {
  // Two chunks with a foreign hole between them; a blob may not straddle it.
  const packer = new Packer([{start: 0x100, end: 0x120},
                             {start: 0x140, end: 0x150}]);
  eq('packer capacity', packer.capacity, 0x30);

  const big = new Array(0x20).fill(1);
  eq('big blob takes the exact-fit chunk', packer.place(big), 0x100);
  eq('identical content is shared', packer.place([...big]), 0x100);
  eq('shared content is not double-counted', packer.allocated, 0x20);

  const small = [9, 9, 9, 9];
  eq('small blob goes to the second chunk', packer.place(small), 0x140);
  eq('remaining', packer.remaining, 0x0c);
  eq('no room for something too large',
     packer.place(new Array(0x10).fill(2)), null);
  eq('tails cover the unallocated end',
     packer.tails(), [{start: 0x144, end: 0x150}]);

  // Best-fit must prefer the tighter chunk so the roomier one stays usable.
  const bestFit = new Packer([{start: 0, end: 0x100}, {start: 0x200, end: 0x210}]);
  eq('best fit picks the snug chunk', bestFit.place(new Array(0x10).fill(3)),
     0x200);

  // placeAll orders largest-first, which lets an awkward set fit.
  const batch = new Packer([{start: 0, end: 0x10}, {start: 0x40, end: 0x48}]);
  const failure = batch.placeAll([new Array(8).fill(1), new Array(0x10).fill(2)]);
  eq('placeAll fits both by ordering', failure, null);
  eq('placeAll used everything', batch.remaining, 0);

  const tooMuch = new Packer([{start: 0, end: 4}]);
  const item = new Array(8).fill(7);
  eq('placeAll reports the item that did not fit',
     tooMuch.placeAll([item]), item);
}

function testValidation() {
  const loc = new Location(0x02);
  loc.width = 12;
  loc.height = 20;
  check('validate flags oversize maps', loc.validate().length >= 2,
        JSON.stringify(loc.validate()));
}

function testBps(file: Uint8Array) {
  const rom = Rom.load(file, 'test.nes');
  const leaf = rom.location(LEAF.id);
  leaf.bgm = 0x33;
  leaf.dirty = true;
  const built = rom.build().rom;

  const patch = createBpsPatch(rom.original, built, 'test');
  eq('patch magic', Array.from(patch.subarray(0, 4)), [0x42, 0x50, 0x53, 0x31]);
  eq('bps metadata round trip', readBpsMetadata(patch), 'test');

  const applied = applyBpsPatch(rom.original, patch);
  eq('bps round trip', crc32(applied), crc32(built));

  const footer = patch.subarray(patch.length - 12);
  const le = (o: number) => footer[o] | footer[o + 1] << 8 |
                            footer[o + 2] << 16 | footer[o + 3] << 24;
  eq('source crc in footer', le(0) >>> 0, crc32(rom.original));
  eq('target crc in footer', le(4) >>> 0, crc32(built));
  eq('patch crc in footer', le(8) >>> 0,
     crc32(patch.subarray(0, patch.length - 4)));

  // An identical target should produce a patch with no literal data.
  const clean = Rom.load(file, 'test.nes');
  const noop = createBpsPatch(clean.original, clean.build().rom, '');
  const reapplied = applyBpsPatch(clean.original, noop);
  eq('no-op patch round trip', crc32(reapplied), crc32(clean.original));

  // Project settings live only in BPS metadata. Editing them must never
  // change a byte in the emulator-visible ROM image.
  clean.projectSettings.name = 'My Project';
  clean.projectSettings.version = '2.0';
  clean.projectDirty = true;
  eq('project metadata does not change ROM bytes', crc32(clean.build().rom),
     crc32(clean.original));
  const projectMetadata = clean.projectSettings.toBpsMetadata('2026-08-02T00:00:00.000Z');
  const restoredSettings = ProjectSettings.fromBpsMetadata(projectMetadata);
  eq('project name survives BPS metadata', restoredSettings.name, 'My Project');
  eq('project version survives BPS metadata', restoredSettings.version, '2.0');

  // Loading a patch back on top of the vanilla source (the "resume work"
  // flow) must keep diffing against the vanilla bytes, not the patched ones.
  const resumed = Rom.load(applied, 'test.nes', rom.original);
  eq('resumed rom keeps vanilla original', crc32(resumed.original), crc32(rom.original));
  const resumedPatch = createBpsPatch(resumed.original, resumed.build().rom, '');
  eq('resumed export still round-trips to the edited target',
     crc32(applyBpsPatch(resumed.original, resumedPatch)), crc32(built));

  // A patch built against a different source must be rejected.
  let rejected = false;
  try {
    applyBpsPatch(new Uint8Array(rom.original.length), patch);
  } catch {
    rejected = true;
  }
  check('mismatched source is rejected', rejected, 'expected applyBpsPatch to throw');
}

// --------------------------------------------------------------------- main

const file = buildFakeRom();
const rom = Rom.load(file, 'test.nes');

testParse(rom);
testRoundTrip(rom);
testEditInPlace(file);
testMessageEncoding(file);
testEditWithGrowth(file);
testSpawnGrowth(file);
testSharedNpcCopyOnWrite(file);
testFailedBuildIsAtomic(file);
testStoreTransactions(file);
testObjectEdit(file);
testNpcVisibility(file);
testMalformedInput(file);
testPacker();
testValidation();
testBps(file);

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
