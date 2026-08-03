/**
 * Check sprite resolution against a real ROM: how many spawns resolve to a
 * drawable metasprite, and whether the metasprite table parses cleanly.
 *
 * Usage: npm run checksprites [path-to-rom]
 */

import {readFileSync} from 'node:fs';
import {hex} from '../src/rom/bytes';
import {MONSTER_ID_OFFSET} from '../src/rom/constants';
import {SPRITE_TERMINATOR} from '../src/rom/metasprite';
import {Rom} from '../src/rom/rom';

const path = process.argv[2] ?? 'research/Crystalis (USA).nes';
const rom = Rom.load(new Uint8Array(readFileSync(path)), path);

// ------------------------------------------------------------- metasprites

let used = 0, mirrored = 0, unresolvedMirror = 0, totalSprites = 0;
let maxFrames = 0, maxSize = 0;
for (let id = 0; id < 0x100; id++) {
  const ms = rom.metasprites.get(id);
  if (!ms) continue;
  used++;
  if (ms.mirrored != null) {
    mirrored++;
    if (!rom.metasprites.resolve(id)) {
      unresolvedMirror++;
      console.log(`  unresolved mirror: metasprite $${hex(id)} -> ` +
                  `$${hex(ms.mirrored)}`);
    }
    continue;
  }
  maxFrames = Math.max(maxFrames, ms.frames);
  maxSize = Math.max(maxSize, ms.size);
  for (const frame of ms.sprites) {
    for (const s of frame) {
      if (s[0] !== SPRITE_TERMINATOR) totalSprites++;
    }
  }
}
console.log(`metasprites  ${used} used, ${mirrored} mirrored, ` +
            `${unresolvedMirror} unresolvable`);
console.log(`             ${totalSprites} hardware sprites, ` +
            `max ${maxFrames} frames / ${maxSize} per frame`);

// ------------------------------------------------------------------ spawns

const {spriteFor} = await import('../src/render/sprites');

let total = 0, drawn = 0, named = 0, badPattern = 0;
const unresolved = new Map<string, number>();
for (const loc of rom.usedLocations) {
  for (const spawn of loc.spawns) {
    if (!spawn.used) continue;
    total++;
    const draw = spriteFor(rom, loc, spawn, 0);
    const resolved = draw && rom.metasprites.resolve(draw.metaspriteId);
    if (draw && resolved) {
      drawn++;
      // Every CHR tile the metasprite references must exist in the ROM.
      for (const frame of resolved.metasprite.sprites) {
        for (const [dx, , , tile] of frame) {
          if (dx === SPRITE_TERMINATOR) break;
          const patternId = draw.patternPage << 6 | tile & 0x3f;
          if (patternId >= rom.patterns.count) {
            badPattern++;
            console.log(`  CHR out of range: pattern $${hex(patternId, 4)} ` +
                        `(page $${hex(draw.patternPage)}) in ${draw.label}`);
          }
        }
      }
      if (draw.label && !/^\$|^(Monster|NPC|Boss|Wall|Trigger|Generic)$/.test(draw.label)) {
        named++;
      }
    } else {
      const key = draw ?
          `${spawn.kind()} metasprite $${hex(draw.metaspriteId)} unused` :
          `${spawn.kind()} (no sprite mapping)`;
      unresolved.set(key, (unresolved.get(key) ?? 0) + 1);
    }
  }
}
console.log(`spawns       ${total} active, ${drawn} draw a sprite ` +
            `(${(100 * drawn / total).toFixed(1)}%), ${named} have names`);
console.log(`CHR refs     ${badPattern} out-of-range pattern references`);
for (const [key, count] of [...unresolved].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${key}`);
}

// -------------------------------------------------------------- object data

let objectsWithSprites = 0;
const actions = new Map<number, number>();
for (let id = 0x50; id < 0x100; id++) {
  const object = rom.objects.get(id);
  if (!object) continue;
  if (rom.metasprites.get(object.metasprite)) objectsWithSprites++;
  actions.set(object.action, (actions.get(object.action) ?? 0) + 1);
}
console.log(`objects      ${objectsWithSprites} of ${0x100 - MONSTER_ID_OFFSET} ` +
            `spawnable ids have a used metasprite`);

// Spot-check a few known entities.
for (const [locId, label] of [[0x03, 'Valley of Wind'], [0x02, 'Leaf'],
                              [0x1a, 'Swamp']] as Array<[number, string]>) {
  const loc = rom.location(locId);
  const names = loc.spawns.filter(s => s.used)
      .map(s => spriteFor(rom, loc, s, 0)?.label ?? s.kind());
  console.log(`$${hex(locId)} ${label}: ${names.join(', ')}`);
}
