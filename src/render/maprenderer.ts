import {Effect, METATILE_SIZE, SCREEN_PX_HEIGHT,
        SCREEN_PX_WIDTH} from '../rom/constants';
import type {Location} from '../rom/location';
import {hex} from '../rom/bytes';
import {flagLabel} from '../rom/flagnames';
import {ctxKey} from './graphics';
import type {Graphics, RenderCtx} from './graphics';
import {cssColor} from './nespalette';
import {drawSprite, spriteFor} from './sprites';

export interface Overlays {
  tileGrid: boolean;
  screenGrid: boolean;
  /** Draw the actual metasprite graphics for each spawn. */
  sprites: boolean;
  /** Draw a marker and label for each spawn. */
  spawnLabels: boolean;
  entrances: boolean;
  exits: boolean;
  flags: boolean;
  pits: boolean;
  /** Tint impassable / damaging tiles using the location's tile effects. */
  effects: boolean;
}

export const DEFAULT_OVERLAYS: Overlays = {
  tileGrid: true,
  screenGrid: true,
  sprites: true,
  spawnLabels: false,
  entrances: true,
  exits: true,
  flags: true,
  pits: true,
  effects: true,
};

export function renderContext(loc: Location): RenderCtx {
  return {
    tileset: loc.tileset,
    patterns: loc.tilePatterns,
    palettes: loc.tilePalettes,
  };
}

/**
 * Draw a location into `target` at `scale` device pixels per map pixel.  The
 * backing store is sized for the scale so annotations and text are rendered at
 * full resolution instead of being blown up by the browser; tiles still use
 * nearest-neighbour sampling, so the pixel art stays crisp.  All drawing below
 * stays in unscaled map coordinates.
 */
export function renderLocation(g: Graphics, loc: Location,
                               target: HTMLCanvasElement,
                               overlays: Overlays,
                               flaggedScreens: boolean,
                               frame = 0,
                               scale = 1) {
  const ctx = renderContext(loc);
  target.width = Math.max(1, Math.round(loc.pxWidth * scale));
  target.height = Math.max(1, Math.round(loc.pxHeight * scale));
  const c2d = target.getContext('2d')!;
  c2d.imageSmoothingEnabled = false;

  // The background/effects and grid/annotation layers only depend on ROM
  // data and overlay toggles, not on the animation frame, so they're cached
  // as full-resolution bitmaps and just blitted back in on ticks that only
  // change sprites (e.g. the animation timer) - full-map redraws were the
  // main source of stutter when zoomed into a large map.
  const sig = overlaySignature(ctx, loc, overlays, flaggedScreens, scale);
  const {bottom, top} = g.overlayLayers(loc.id, sig,
      () => buildBottomLayer(g, loc, ctx, overlays, flaggedScreens, scale),
      () => buildTopLayer(loc, overlays, scale));

  c2d.setTransform(1, 0, 0, 1, 0, 0);
  c2d.drawImage(bottom, 0, 0);

  // Sprites sit above the background but below the annotation layer.
  c2d.setTransform(scale, 0, 0, scale, 0, 0);
  const unrendered = overlays.sprites ?
      drawSpawnSprites(g, loc, c2d, frame) : new Set(loc.spawns.keys());

  c2d.setTransform(1, 0, 0, 1, 0, 0);
  c2d.drawImage(top, 0, 0);

  c2d.setTransform(scale, 0, 0, scale, 0, 0);
  drawSpawnMarkers(c2d, loc, unrendered, overlays.spawnLabels);
}

/** Cheap content fingerprint for the cached static layers below. */
function overlaySignature(ctx: RenderCtx, loc: Location, overlays: Overlays,
                          flaggedScreens: boolean, scale: number): string {
  const bits = (overlays.effects ? 1 : 0) | (overlays.tileGrid ? 2 : 0) |
               (overlays.screenGrid ? 4 : 0) | (overlays.flags ? 8 : 0) |
               (overlays.exits ? 16 : 0) | (overlays.entrances ? 32 : 0) |
               (overlays.pits ? 64 : 0);
  const screens = loc.screens.map(row => row.join(',')).join('|');
  const flags = loc.flags.map(f => f.data.join(',')).join('|');
  const exits = loc.exits.map(e => e.data.join(',')).join('|');
  const entrances = loc.entrances.map(e => e.data.join(',')).join('|');
  const pits = loc.pits.map(p => p.data.join(',')).join('|');
  return [ctxKey(ctx), loc.id, loc.tileEffects, scale, flaggedScreens ? 1 : 0,
          bits, screens, flags, exits, entrances, pits].join('#');
}

/**
 * Fingerprint for just the effects tint layer: screen contents, tile effects
 * and flags (which pick the flagged-alternate tiles), but not `scale` or any
 * unrelated overlay toggle - those used to force a full re-tint of every
 * tile on every zoom step or grid/label click.
 */
function effectsSignature(ctx: RenderCtx, loc: Location,
                          flaggedScreens: boolean): string {
  const screens = loc.screens.map(row => row.join(',')).join('|');
  const flags = loc.flags.map(f => f.data.join(',')).join('|');
  return [ctxKey(ctx), loc.id, loc.tileEffects, flaggedScreens ? 1 : 0,
          screens, flags].join('#');
}

/** Background screens plus the tile-effect tint, at device resolution. */
function buildBottomLayer(g: Graphics, loc: Location, ctx: RenderCtx,
                          overlays: Overlays, flaggedScreens: boolean,
                          scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(loc.pxWidth * scale));
  canvas.height = Math.max(1, Math.round(loc.pxHeight * scale));
  const c2d = canvas.getContext('2d')!;
  c2d.setTransform(scale, 0, 0, scale, 0, 0);
  c2d.imageSmoothingEnabled = false;
  c2d.fillStyle = cssColor(g.backdrop(ctx));
  c2d.fillRect(0, 0, loc.pxWidth, loc.pxHeight);

  for (let y = 0; y < loc.height; y++) {
    for (let x = 0; x < loc.width; x++) {
      const flagged = flaggedScreens && !!loc.flagAt(x, y);
      const screen = g.screen(ctx, loc.screenAt(x, y), flagged);
      c2d.drawImage(screen, x * SCREEN_PX_WIDTH, y * SCREEN_PX_HEIGHT);
    }
  }
  if (overlays.effects) {
    const sig = effectsSignature(ctx, loc, flaggedScreens);
    const effects = g.effectsLayer(loc.id, sig,
        () => buildEffectsLayer(g, loc, flaggedScreens));
    c2d.drawImage(effects, 0, 0);
  }
  return canvas;
}

/** Tile-effect tint layer at native (1x) resolution; blitted in scaled. */
function buildEffectsLayer(g: Graphics, loc: Location,
                           flaggedScreens: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, loc.pxWidth);
  canvas.height = Math.max(1, loc.pxHeight);
  const c2d = canvas.getContext('2d')!;
  drawEffects(g, loc, c2d, flaggedScreens);
  return canvas;
}

/** Grid lines, flag/exit/entrance annotations, at device resolution. */
function buildTopLayer(loc: Location, overlays: Overlays,
                       scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(loc.pxWidth * scale));
  canvas.height = Math.max(1, Math.round(loc.pxHeight * scale));
  const c2d = canvas.getContext('2d')!;
  c2d.setTransform(scale, 0, 0, scale, 0, 0);
  c2d.imageSmoothingEnabled = false;

  if (overlays.tileGrid) {
    drawGrid(c2d, loc.pxWidth, loc.pxHeight, METATILE_SIZE,
             'rgba(255,255,255,0.10)');
  }
  if (overlays.screenGrid) drawScreenGrid(c2d, loc);
  if (overlays.flags) drawFlags(c2d, loc);
  if (overlays.pits) drawPits(c2d, loc);
  if (overlays.exits) drawExits(c2d, loc);
  if (overlays.entrances) drawEntrances(c2d, loc);
  return canvas;
}

/**
 * Draw every spawn's metasprite.  Returns the indices of spawns that could not
 * be drawn (walls, triggers, and objects whose metasprite is unused) so the
 * caller can fall back to a marker for those.
 */
function drawSpawnSprites(g: Graphics, loc: Location,
                          c2d: CanvasRenderingContext2D,
                          frame: number): Set<number> {
  const unrendered = new Set<number>();
  const tile = (patternId: number, paletteId: number, flip: number) =>
      g.spriteTile(patternId, paletteId, flip);

  for (let i = 0; i < loc.spawns.length; i++) {
    const spawn = loc.spawns[i];
    const draw = spriteFor(g.rom, loc, spawn, frame);
    if (!spawn.used) c2d.filter = 'grayscale(1) opacity(0.5)';
    const ok = draw && drawSprite(c2d, tile, g.rom, draw, frame);
    if (!spawn.used) c2d.filter = 'none';
    if (!ok) unrendered.add(i);
  }
  return unrendered;
}

function drawEffects(g: Graphics, loc: Location, c2d: CanvasRenderingContext2D,
                     flaggedScreens: boolean) {
  const ctx = renderContext(loc);
  const effects = g.rom.tilesets.effects(loc.tileEffects).effects;
  for (let sy = 0; sy < loc.height; sy++) {
    for (let sx = 0; sx < loc.width; sx++) {
      const flagged = flaggedScreens && !!loc.flagAt(sx, sy);
      const screen = g.rom.screens.get(loc.screenAt(sx, sy));
      for (let ty = 0; ty < 15; ty++) {
        for (let tx = 0; tx < 16; tx++) {
          const metatile =
              g.effectiveMetatile(ctx, screen.tiles[ty << 4 | tx], flagged);
          const fx = effects[metatile];
          const fill = effectColor(fx);
          if (!fill) continue;
          c2d.fillStyle = fill;
          c2d.fillRect(sx * SCREEN_PX_WIDTH + tx * METATILE_SIZE,
                       sy * SCREEN_PX_HEIGHT + ty * METATILE_SIZE,
                       METATILE_SIZE, METATILE_SIZE);
        }
      }
    }
  }
}

function effectColor(fx: number): string | null {
  if (fx & Effect.PIT) return 'rgba(120, 40, 200, 0.45)';
  if (fx & Effect.PAIN) return 'rgba(220, 40, 40, 0.35)';
  if (fx & Effect.IMPASSIBLE) return 'rgba(0, 0, 0, 0.42)';
  if (fx & Effect.NO_WALK) return 'rgba(30, 90, 220, 0.30)';
  if (fx & Effect.SLOPE) return 'rgba(240, 200, 60, 0.28)';
  return null;
}

function drawGrid(c2d: CanvasRenderingContext2D, width: number, height: number,
                  step: number, color: string) {
  c2d.strokeStyle = color;
  c2d.lineWidth = 1;
  c2d.beginPath();
  for (let x = step; x < width; x += step) {
    c2d.moveTo(x + 0.5, 0);
    c2d.lineTo(x + 0.5, height);
  }
  for (let y = step; y < height; y += step) {
    c2d.moveTo(0, y + 0.5);
    c2d.lineTo(width, y + 0.5);
  }
  c2d.stroke();
}

function drawScreenGrid(c2d: CanvasRenderingContext2D, loc: Location) {
  c2d.strokeStyle = 'rgba(90, 200, 255, 0.45)';
  c2d.lineWidth = 1;
  c2d.beginPath();
  for (let x = 1; x < loc.width; x++) {
    c2d.moveTo(x * SCREEN_PX_WIDTH + 0.5, 0);
    c2d.lineTo(x * SCREEN_PX_WIDTH + 0.5, loc.pxHeight);
  }
  for (let y = 1; y < loc.height; y++) {
    c2d.moveTo(0, y * SCREEN_PX_HEIGHT + 0.5);
    c2d.lineTo(loc.pxWidth, y * SCREEN_PX_HEIGHT + 0.5);
  }
  c2d.stroke();
}

/** Pixel position of a flag's marker: top-left corner of its screen. */
export function flagPoint(flag: {screenX: number, screenY: number}) {
  return {x: flag.screenX * SCREEN_PX_WIDTH + 4, y: flag.screenY * SCREEN_PX_HEIGHT + 4};
}

function drawFlags(c2d: CanvasRenderingContext2D, loc: Location) {
  for (let i = 0; i < loc.flags.length; i++) {
    const flag = loc.flags[i];
    const x = flag.screenX * SCREEN_PX_WIDTH;
    const y = flag.screenY * SCREEN_PX_HEIGHT;
    c2d.strokeStyle = 'rgba(255, 210, 60, 0.8)';
    c2d.lineWidth = 2;
    c2d.strokeRect(x + 1, y + 1, SCREEN_PX_WIDTH - 2, SCREEN_PX_HEIGHT - 2);
    label(c2d, x + 4, y + 4, `Event Flag ${i} (0x${hex(flag.flag, 3)})`, FLAG_COLOR);
    label(c2d, x + 4, y + 13, flagLabel(flag.flag), FLAG_COLOR);
  }
}

export const FLAG_COLOR = '#ffd23c';
export const EXIT_COLOR = '#ff5c8a';
export const ENTRANCE_COLOR = '#50dc8c';
export const PIT_COLOR = '#b57cff';

/** Pixel position of a pit's marker: centered on its source screen. */
export function pitPoint(pit: {fromXs: number, fromYs: number}) {
  return {
    x: pit.fromXs * SCREEN_PX_WIDTH + SCREEN_PX_WIDTH / 2,
    y: pit.fromYs * SCREEN_PX_HEIGHT + SCREEN_PX_HEIGHT / 2,
  };
}

function drawPits(c2d: CanvasRenderingContext2D, loc: Location) {
  for (let i = 0; i < loc.pits.length; i++) {
    const {x, y} = pitPoint(loc.pits[i]);
    idBadge(c2d, x, y, hex(i), PIT_COLOR);
  }
}

function drawExits(c2d: CanvasRenderingContext2D, loc: Location) {
  for (let i = 0; i < loc.exits.length; i++) {
    const exit = loc.exits[i];
    idBadge(c2d, exit.px + METATILE_SIZE / 2, exit.py + METATILE_SIZE / 2, hex(i), EXIT_COLOR);
  }
}

function drawEntrances(c2d: CanvasRenderingContext2D, loc: Location) {
  for (let i = 0; i < loc.entrances.length; i++) {
    const e = loc.entrances[i];
    // Disabled entrances have their x byte pushed out of range (see
    // Entrance.used), which also corrupts screenX - there's no real position
    // to plot, so unlike unused spawns these can't be shown dimmed in place.
    if (!e.used) continue;
    idBadge(c2d, e.px + METATILE_SIZE / 2, e.py + METATILE_SIZE / 2, hex(i), ENTRANCE_COLOR);
  }
}

/**
 * Annotate spawns.  Anything in `needsMarker` gets a box regardless, since
 * nothing was drawn for it; the rest only get one when labels are enabled.
 */
function drawSpawnMarkers(c2d: CanvasRenderingContext2D, loc: Location,
                          needsMarker: Set<number>, labels: boolean) {
  for (let i = 0; i < loc.spawns.length; i++) {
    const spawn = loc.spawns[i];
    const missing = needsMarker.has(i);
    if (!missing && !labels && spawn.used) continue;
    const color = spawn.used ? spawnColor(spawn.kind()) : dimColor(spawnColor(spawn.kind()));
    const cx = spawn.px + METATILE_SIZE / 2, cy = spawn.py + METATILE_SIZE / 2;
    if (missing) {
      // No sprite art to overlay (walls, triggers) - same filled-badge
      // language as exits/entrances/pits, just color-coded by spawn kind.
      idBadge(c2d, cx, cy, hex(i), color);
      continue;
    }
    marker(c2d, cx, cy, color);
    if (labels || !spawn.used) {
      label(c2d, spawn.px + 12, spawn.py, `${spawn.kind()} ${i}`, color);
    }
  }
}

function spawnColor(kind: string): string {
  switch (kind) {
    case 'Enemy': return '#ff7043';
    case 'Boss': return '#ff1744';
    case 'NPC': return '#4fc3f7';
    case 'Chest': return '#ffd54f';
    case 'Trigger': return '#ce93d8';
    case 'Wall': return '#a1887f';
    default: return '#b0bec5';
  }
}

/** Grey out + fade a hex color, for markers on inactive spawns/entrances. */
function dimColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const gray = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  return `rgba(${gray}, ${gray}, ${gray}, 0.5)`;
}

function marker(c2d: CanvasRenderingContext2D, x: number, y: number,
                color: string) {
  c2d.strokeStyle = color;
  c2d.lineWidth = 2;
  c2d.strokeRect(x - 7, y - 7, 14, 14);
}

/** Draw a filled square centered on (x, y) with a two-digit hex id. */
function idBadge(c2d: CanvasRenderingContext2D, x: number, y: number, text: string,
                 color: string) {
  const size = 14;
  c2d.fillStyle = color;
  c2d.fillRect(x - size / 2, y - size / 2, size, size);
  c2d.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  c2d.lineWidth = 1;
  c2d.strokeRect(x - size / 2 + 0.5, y - size / 2 + 0.5, size - 1, size - 1);
  c2d.font = 'bold 8px ui-monospace, monospace';
  c2d.textBaseline = 'middle';
  c2d.textAlign = 'center';
  c2d.fillStyle = '#0a0a0a';
  c2d.fillText(text, x, y + 1);
  c2d.textAlign = 'left';
}

function label(c2d: CanvasRenderingContext2D, x: number, y: number, text: string,
               color: string) {
  c2d.font = '8px ui-monospace, monospace';
  c2d.textBaseline = 'top';
  const w = c2d.measureText(text).width;
  c2d.fillStyle = 'rgba(0, 0, 0, 0.6)';
  c2d.fillRect(x - 1, y - 1, w + 2, 10);
  c2d.fillStyle = color;
  c2d.fillText(text, x, y);
}
