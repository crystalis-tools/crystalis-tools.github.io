import {Action, CHEST_METASPRITE, MONSTER_ID_OFFSET,
        SPRITE_PALETTE_BASE} from '../rom/constants';
import type {Location} from '../rom/location';
import type {Spawn} from '../rom/locationtables';
import {SPRITE_TERMINATOR} from '../rom/metasprite';
import type {Rom} from '../rom/rom';

/** Everything needed to draw one spawn's sprite. */
export interface SpriteDraw {
  metaspriteId: number;
  /** CHR page the metasprite's tiles are read from. */
  patternPage: number;
  /** Palette ids for sprite attribute bits 0..3. */
  palettes: [number, number, number, number];
  /** Pixel position of the sprite's origin on the composed map. */
  x: number;
  y: number;
  /** Display label, e.g. the monster or NPC name. */
  label: string;
}

/** Sprites are drawn centred on the tile and pushed down 12px, as in-game. */
const SPRITE_X_OFFSET = 8;
const SPRITE_Y_OFFSET = 0xc;

/**
 * The four sprite palettes available to a location: two fixed system palettes
 * followed by the location's own two, all offset into the sprite palette range.
 */
export function spritePalettes(loc: Location): [number, number, number, number] {
  return [
    SPRITE_PALETTE_BASE,
    SPRITE_PALETTE_BASE + 1,
    (loc.spritePalettes[0] + SPRITE_PALETTE_BASE) & 0xff,
    (loc.spritePalettes[1] + SPRITE_PALETTE_BASE) & 0xff,
  ];
}

/**
 * Work out which metasprite a spawn renders as.  Most objects just use their
 * ObjectData metasprite, but a few AI routines pick one at runtime.
 *
 * `frame` is a free-running animation counter; pass 0 for a static render.
 */
export function spriteFor(rom: Rom, loc: Location, spawn: Spawn,
                          frame: number): SpriteDraw | null {
  if (!spawn.used) return null;

  const patternPage = loc.spritePatterns[spawn.patternBank] ?? 0;
  const palettes = spritePalettes(loc);
  const x = spawn.px + SPRITE_X_OFFSET;
  const y = spawn.py + SPRITE_Y_OFFSET;

  let metaspriteId: number | null = null;
  let label = spawn.kind();

  if (spawn.isMonster()) {
    const object = rom.objects.get((spawn.id + MONSTER_ID_OFFSET) & 0xff);
    if (!object) return null;
    label = object.displayName;
    metaspriteId = object.metasprite;
    if (object.action === Action.BLOB) {
      // Blobs toggle between two unrelated metasprites rather than frames.
      metaspriteId = frame & 32 ? 0x6b : 0x68;
    } else if (object.action === Action.WALKER ||
               object.action === Action.TOWER_MECH) {
      metaspriteId = facingMetasprite(object.directionBase, frame);
    }
  } else if (spawn.type === 1) {
    // Bosses share the NPC type but have no appearance record of their own.
    const npc = rom.npcs.get(spawn.id);
    if (!npc || !npc.metaspriteBase) return null;
    label = npc.displayName;
    metaspriteId = facingMetasprite(npc.metaspriteBase, frame);
  } else if (spawn.isChest()) {
    metaspriteId = CHEST_METASPRITE;
    label = `Chest $${spawn.id.toString(16).padStart(2, '0')}`;
  }

  if (metaspriteId == null) return null;
  return {metaspriteId, patternPage, palettes, x, y, label};
}

/** Direction-facing sprites store four consecutive metasprites. */
export function facingMetasprite(base: number, frame: number): number {
  return (((frame >> 5) + 2) & 3) | base;
}

/**
 * Draw a spawn's metasprite. `graphics` supplies the cached 8x8 tile canvases;
 * this function only handles composition, mirroring and flips.
 */
export function drawSprite(c2d: CanvasRenderingContext2D,
                           tile: (patternId: number, paletteId: number,
                                  flip: number) => HTMLCanvasElement | null,
                           rom: Rom, draw: SpriteDraw, frame: number): boolean {
  const resolved = rom.metasprites.resolve(draw.metaspriteId);
  if (!resolved) return false;
  const {metasprite, mirrored} = resolved;

  const sprites = metasprite.frame(frame >> 2);
  if (!sprites.length) return false;

  for (const [rawDx, rawDy, rawAttr, tileIndex] of sprites) {
    if (rawDx === SPRITE_TERMINATOR) break;
    let dx = signed(rawDx);
    const dy = signed(rawDy);
    let attr = rawAttr;
    if (mirrored) {
      dx = -8 - dx;
      attr ^= 0x40;
    }
    const patternId = draw.patternPage << 6 | tileIndex & 0x3f;
    const canvas = tile(patternId, draw.palettes[attr & 3], attr & 0xc0);
    if (canvas) c2d.drawImage(canvas, draw.x + dx, draw.y + dy);
  }
  return true;
}

function signed(byte: number): number {
  return byte < 0x80 ? byte : byte - 0x100;
}
