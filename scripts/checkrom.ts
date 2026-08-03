/**
 * Sanity-check the ROM layer against a real Crystalis image.
 *
 * Usage: npm run checkrom [path-to-rom]
 * Defaults to the copy in research/.
 */

import {readFileSync} from 'node:fs';
import {crc32, hex} from '../src/rom/bytes';
import {Rom} from '../src/rom/rom';

const path = process.argv[2] ?? 'research/Crystalis (USA).nes';
const file = new Uint8Array(readFileSync(path));
const rom = Rom.load(file, path);

console.log(`file      ${file.length} bytes, CRC ${hex(crc32(file), 8)}`);
console.log(`prg/chr   ${rom.prg.length} / ${rom.chr.length}, ` +
            `PRG CRC ${hex(rom.info.crc, 8)}`);

const used = rom.usedLocations;
console.log(`locations ${used.length} used of 256`);

let maxW = 0, maxH = 0, spawns = 0, pitLocs = 0, extLocs = 0, problems = 0;
const tilesets = new Set<number>();
const effects = new Set<number>();
for (const loc of used) {
  maxW = Math.max(maxW, loc.width);
  maxH = Math.max(maxH, loc.height);
  spawns += loc.spawns.length;
  if (loc.pits.length) pitLocs++;
  if (loc.plane) extLocs++;
  tilesets.add(loc.tileset);
  effects.add(loc.tileEffects);

  for (const p of loc.validate()) {
    console.log(`  VALIDATE $${hex(loc.id)} ${loc.name}: ${p}`);
    problems++;
  }
  const size = loc.mapDataSize();
  const capacity = loc.extent.mapDataEnd - loc.extent.mapDataStart;
  if (size > capacity) {
    // Expected where vanilla shares a block between locations: the extent is
    // smaller than a self-contained blob, so an edit forces relocation.
    console.log(`  relocates on edit: $${hex(loc.id)} ${loc.name} ` +
                `(${size} > ${capacity} bytes)`);
  }
}
console.log(`max size  ${maxW}x${maxH} screens`);
console.log(`spawns    ${spawns} across all locations`);
console.log(`pits      ${pitLocs} locations, extended plane ${extLocs}`);
console.log(`tilesets  ${[...tilesets].sort((a, b) => a - b).map(t => hex(t)).join(' ')}`);
console.log(`effects   ${[...effects].sort((a, b) => a - b).map(t => hex(t)).join(' ')}`);

let messageCount = 0;
for (let p = 0; p < rom.messages.partCount; p++) messageCount += rom.messages.countInPart(p);
console.log(`messages  ${messageCount} across ${rom.messages.partCount} parts`);
if (messageCount < 200) {
  console.log(`  PROBLEM: expected several hundred messages, got ${messageCount}`);
  problems++;
}
const firstMessage = rom.messages.get(0, 0) ?? '';
if (!/^[ -~\n]+$/.test(firstMessage) || firstMessage.length < 5) {
  console.log(`  PROBLEM: message 00:00 doesn't look like decoded text: ` +
              `${JSON.stringify(firstMessage)}`);
  problems++;
}

const triggers = rom.triggers.list();
console.log(`triggers  ${triggers.length} used of $43`);
if (triggers.length < 30) {
  console.log(`  PROBLEM: expected 30+ used triggers, got ${triggers.length}`);
  problems++;
}
for (const t of triggers) {
  if (t.message.part >= rom.messages.partCount) {
    console.log(`  PROBLEM: trigger $${hex(t.id)} references message part ` +
                `${t.message.part}, only ${rom.messages.partCount} exist`);
    problems++;
  }
}

const clean = rom.build();
const identical = crc32(clean.rom) === crc32(file);
console.log(`clean build byte-identical: ${identical}`);
if (!identical) {
  problems++;
  let shown = 0;
  for (let i = 0; i < file.length && shown < 20; i++) {
    if (file[i] !== clean.rom[i]) {
      console.log(`  diff @ $${hex(i, 5)}: ${hex(file[i])} -> ${hex(clean.rom[i])}`);
      shown++;
    }
  }
}
for (const w of clean.warnings) console.log(`  WARNING ${w}`);

// ------------------------------------------------------------- rewrite all
//
// Marking every location dirty forces the writer down its full path -
// in-place where the slot allows, relocation everywhere else - then we reload
// the result and compare every field we parse.  This is the strongest check
// available without running the game.

for (const loc of rom.locations) {
  if (loc.used) loc.dirty = true;
}
const rewritten = rom.build();
console.log(`rewrite all: ${rewritten.warnings.length} warnings`);
for (const w of rewritten.warnings) {
  console.log(`  WARNING ${w}`);
  problems++;
}

const before = Rom.load(file, path);
const after = Rom.load(rewritten.rom, path);
let mismatches = 0;
let relocated = 0;
for (const a of before.usedLocations) {
  const b = after.location(a.id);
  if (!b.used) {
    console.log(`  LOST $${hex(a.id)} ${a.name}`);
    mismatches++;
    continue;
  }
  const fields: Array<[string, unknown, unknown]> = [
    ['bgm', a.bgm, b.bgm],
    ['width', a.width, b.width],
    ['height', a.height, b.height],
    ['animation', a.animation, b.animation],
    ['plane', a.plane, b.plane],
    ['screens', a.screens, b.screens],
    ['tilePalettes', a.tilePalettes, b.tilePalettes],
    ['tileset', a.tileset, b.tileset],
    ['tileEffects', a.tileEffects, b.tileEffects],
    ['tilePatterns', a.tilePatterns, b.tilePatterns],
    ['entrances', a.entrances.map(e => e.data), b.entrances.map(e => e.data)],
    ['exits', a.exits.map(e => e.data), b.exits.map(e => e.data)],
    ['flags', a.flags.map(f => f.data), b.flags.map(f => f.data)],
    ['pits', a.pits.map(p => p.data), b.pits.map(p => p.data)],
    ['spawns', a.spawns.map(s => s.data), b.spawns.map(s => s.data)],
    ['spritePalettes', a.spritePalettes, b.spritePalettes],
    ['spritePatterns', a.spritePatterns, b.spritePatterns],
    ['checkpoint', a.checkpoint, b.checkpoint],
    ['saveable', a.saveable, b.saveable],
  ];
  for (const [name, x, y] of fields) {
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      console.log(`  MISMATCH $${hex(a.id)} ${a.name}.${name}`);
      console.log(`    before ${JSON.stringify(x)}`);
      console.log(`    after  ${JSON.stringify(y)}`);
      mismatches++;
      break;
    }
  }
  if (a.extent.mapDataStart !== b.extent.mapDataStart) relocated++;
}
console.log(`rewrite all: ${mismatches} field mismatches across ` +
            `${before.usedLocations.length} locations ` +
            `(${relocated} relocated)`);
for (const line of rewritten.log.slice(-3)) console.log(`  ${line}`);
problems += mismatches;

// ------------------------------------------------------------------ growth
//
// Grow a location past its slot and confirm the writer finds room, the edit
// survives a reload, and every other location is left intact.

const grow = Rom.load(file, path);
const target = grow.location(0x03); // Valley of Wind, 5x7 screens
const originalScreens = target.screens.map(r => [...r]);
target.resize(8, 16);
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 8; x++) {
    if (originalScreens[y]?.[x] == null) target.screens[y][x] = target.plane;
  }
}
// Vanilla leaves ~30 bytes of slack in the NPC banks, so stay inside it.
for (let i = 0; i < 4; i++) {
  const spawn = grow.location(0x03).spawns[0];
  if (spawn) target.spawns.push(new (spawn.constructor as any)([...spawn.data]));
}
target.dirty = true;

const grown = grow.build();
console.log(`growth: ${grown.warnings.length} warnings`);
for (const w of grown.warnings) {
  console.log(`  WARNING ${w}`);
  problems++;
}
for (const line of grown.log.slice(-3)) console.log(`  ${line}`);

if (!grown.warnings.length) {
  const reloaded = Rom.load(grown.rom, path);
  const check = reloaded.location(0x03);
  if (check.width !== 8 || check.height !== 16) {
    console.log(`  MISMATCH grown size ${check.width}x${check.height}`);
    problems++;
  }
  if (check.spawns.length !== target.spawns.length) {
    console.log(`  MISMATCH grown spawn count ${check.spawns.length} != ` +
                `${target.spawns.length}`);
    problems++;
  }
  let others = 0;
  for (const a of before.usedLocations) {
    if (a.id === 0x03) continue;
    const b = reloaded.location(a.id);
    if (JSON.stringify(a.screens) !== JSON.stringify(b.screens) ||
        JSON.stringify(a.spawns.map(s => s.data)) !==
            JSON.stringify(b.spawns.map(s => s.data))) {
      others++;
    }
  }
  console.log(`  grown to ${check.width}x${check.height}, ` +
              `${check.spawns.length} spawns; ${others} other locations changed`);
  problems += others;
}

// Overflowing the NPC banks must fail atomically.
const overflow = Rom.load(file, path);
const victim = overflow.location(0x03);
for (let i = 0; i < 40; i++) {
  victim.spawns.push(new (victim.spawns[0].constructor as any)(
      [...victim.spawns[0].data]));
}
victim.dirty = true;
const overflowed = overflow.build();
if (!overflowed.warnings.length) {
  console.log('  MISSING WARNING: 40 extra spawns should not fit');
  problems++;
} else {
  const intact = overflowed.rom.length === file.length &&
                 overflowed.rom.every((byte, i) => byte === file[i]);
  console.log(`overflow: warned, output is ` +
              `${intact ? 'byte-identical to input' : 'PARTIALLY WRITTEN'}`);
  if (!intact) problems++;
}

process.exit(problems ? 1 : 0);
