import {METATILE_SIZE, SCREEN_HEIGHT, SCREEN_PX_HEIGHT, SCREEN_PX_WIDTH,
        SCREEN_WIDTH} from '../rom/constants';
import type {Rom} from '../rom/rom';
import {abgr} from './nespalette';

/** Everything that affects how a metatile id is rasterized. */
export interface RenderCtx {
  tileset: number;
  patterns: readonly [number, number];
  palettes: readonly [number, number, number];
}

export function ctxKey(ctx: RenderCtx): string {
  return `${ctx.tileset}:${ctx.patterns[0]},${ctx.patterns[1]}:` +
         `${ctx.palettes[0]},${ctx.palettes[1]},${ctx.palettes[2]}`;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/**
 * Rasterizes CHR tiles, metatiles and whole screens, caching at each level.
 * Caches are invalidated wholesale by `invalidate()` when the underlying ROM
 * data changes.
 */
export class Graphics {
  /** 8x8 tile pixels, keyed by `patternId << 8 | paletteId`. */
  private tileCache = new Map<number, Uint32Array>();
  /** 16x16 metatile canvases, keyed by `${ctxKey}/${metatileId}`. */
  private metatileCache = new Map<string, HTMLCanvasElement>();
  /** 256x240 screen canvases, keyed by `${ctxKey}/${screenId}/${flagged}`. */
  private screenCache = new Map<string, HTMLCanvasElement>();
  /** 8x8 sprite tiles with transparency, keyed by pattern/palette/flip. */
  private spriteTileCache = new Map<number, HTMLCanvasElement | null>();

  // Screens (245KB/entry) and metatiles (1KB/entry, but many per screen) are
  // the only caches with real memory weight - a long session that visits a
  // lot of locations/tilesets can otherwise grow them without bound. Capped
  // with simple insertion-order LRU (evict oldest on overflow, touch on hit).
  private static readonly SCREEN_CACHE_SIZE = 300;
  private static readonly METATILE_CACHE_SIZE = 4000;

  /**
   * Full-map "static" layers (background/annotations, and effects tint) used
   * by `renderLocation` to avoid redoing the whole-map draw on every repaint
   * (sprite animation ticks, hover, etc). Keyed per-location (by the caller's
   * `sig`) with a small LRU cap, so switching between several open map tabs -
   * each animating on its own timer - doesn't evict and rebuild every other
   * tab's layers on each tick.
   */
  private static readonly OVERLAY_CACHE_SIZE = 8;
  private overlayLayerCache = new Map<string,
      {sig: string, bottom: HTMLCanvasElement, top: HTMLCanvasElement}>();
  /**
   * The tile-effect tint layer, cached separately from the rest of the
   * bottom layer (native resolution, not scaled) since it only depends on
   * screen contents/tile effects/flags - not on zoom or on unrelated overlay
   * toggles like the grid - which otherwise forced a full re-tint on every
   * zoom step or toggle click.
   */
  private effectsLayerCache = new Map<string, {sig: string, canvas: HTMLCanvasElement}>();

  constructor(readonly rom: Rom) {}

  invalidate() {
    this.tileCache.clear();
    this.metatileCache.clear();
    this.screenCache.clear();
    this.spriteTileCache.clear();
    this.overlayLayerCache.clear();
    this.effectsLayerCache.clear();
  }

  /** Drop only the cached screens, e.g. after painting a metatile. */
  invalidateScreens() {
    this.screenCache.clear();
    this.overlayLayerCache.clear();
    this.effectsLayerCache.clear();
  }

  /** Move `key` to most-recently-used and evict the oldest entry past `cap`. */
  private static lruTouch<V>(cache: Map<string, V>, key: string, value: V, cap: number) {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > cap) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  /**
   * The cached bottom (background+effects) and top (grid/annotations) layers
   * for the given location, rebuilding via the supplied callbacks only when
   * `sig` (which folds in everything that affects the layers) changes.
   */
  overlayLayers(locId: number, sig: string, buildBottom: () => HTMLCanvasElement,
               buildTop: () => HTMLCanvasElement):
      {bottom: HTMLCanvasElement, top: HTMLCanvasElement} {
    const key = String(locId);
    let entry = this.overlayLayerCache.get(key);
    if (!entry || entry.sig !== sig) {
      entry = {sig, bottom: buildBottom(), top: buildTop()};
    }
    Graphics.lruTouch(this.overlayLayerCache, key, entry, Graphics.OVERLAY_CACHE_SIZE);
    return {bottom: entry.bottom, top: entry.top};
  }

  /**
   * The cached tile-effect tint layer for a location, at native (1x)
   * resolution; the caller blits it in scaled like everything else.
   */
  effectsLayer(locId: number, sig: string, build: () => HTMLCanvasElement): HTMLCanvasElement {
    const key = String(locId);
    let entry = this.effectsLayerCache.get(key);
    if (!entry || entry.sig !== sig) {
      entry = {sig, canvas: build()};
    }
    Graphics.lruTouch(this.effectsLayerCache, key, entry, Graphics.OVERLAY_CACHE_SIZE);
    return entry.canvas;
  }

  /** Drop caches that depend on a single metatile of a tileset. */
  invalidateMetatile(tileset: number, metatile: number) {
    for (const key of [...this.metatileCache.keys()]) {
      if (key.startsWith(`${tileset}:`) && key.endsWith(`/${metatile}`)) {
        this.metatileCache.delete(key);
      }
    }
    this.effectsLayerCache.clear();
    this.screenCache.clear();
  }

  /** Background colour of a render context, used to clear the canvas. */
  backdrop(ctx: RenderCtx): number {
    return this.rom.palettes.get(ctx.palettes[0]).color(0);
  }

  private tilePixels(patternId: number, paletteId: number): Uint32Array {
    const key = patternId << 8 | (paletteId & 0xff);
    let pixels = this.tileCache.get(key);
    if (pixels) return pixels;

    pixels = new Uint32Array(64);
    const pattern = this.rom.patterns.get(patternId);
    const palette = this.rom.palettes.get(paletteId);
    for (let r = 0; r < 8; r++) {
      let hi = pattern.pixels[8 | r] << 1;
      let lo = pattern.pixels[r];
      for (let c = 7; c >= 0; c--) {
        const z = hi & 2 | lo & 1;
        hi >>>= 1;
        lo >>>= 1;
        // Colour 0 stays transparent so the backdrop shows through.
        if (z) pixels[r << 3 | c] = abgr(palette.color(z));
      }
    }
    this.tileCache.set(key, pixels);
    return pixels;
  }

  /** Resolve the effective metatile id, following the flag alternate. */
  effectiveMetatile(ctx: RenderCtx, metatile: number, flagged: boolean): number {
    if (!flagged || metatile >= 0x20) return metatile;
    return this.rom.tilesets.get(ctx.tileset).alternates[metatile] ?? metatile;
  }

  /** A 16x16 canvas for one metatile under the given render context. */
  metatile(ctx: RenderCtx, metatile: number): HTMLCanvasElement {
    const key = `${ctxKey(ctx)}/${metatile}`;
    const cached = this.metatileCache.get(key);
    if (cached) {
      Graphics.lruTouch(this.metatileCache, key, cached, Graphics.METATILE_CACHE_SIZE);
      return cached;
    }

    const canvas = makeCanvas(METATILE_SIZE, METATILE_SIZE);
    const c2d = canvas.getContext('2d')!;
    const image = c2d.createImageData(METATILE_SIZE, METATILE_SIZE);
    const words = new Uint32Array(image.data.buffer);

    const tileset = this.rom.tilesets.get(ctx.tileset);
    const paletteIds = [...ctx.palettes, 0x7f];
    const paletteId = paletteIds[tileset.attrs[metatile] & 3];
    const backdrop = abgr(this.rom.palettes.get(paletteId).color(0));
    words.fill(backdrop);

    for (let quad = 0; quad < 4; quad++) {
      const tile = tileset.tiles[quad][metatile];
      const patternId = ctx.patterns[tile & 0x80 ? 1 : 0] << 6 | tile & 0x7f;
      const pixels = this.tilePixels(patternId, paletteId);
      const ox = (quad & 1) << 3;
      const oy = (quad >> 1) << 3;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const px = pixels[r << 3 | c];
          if (px) words[(oy + r) * METATILE_SIZE + ox + c] = px;
        }
      }
    }
    c2d.putImageData(image, 0, 0);
    Graphics.lruTouch(this.metatileCache, key, canvas, Graphics.METATILE_CACHE_SIZE);
    return canvas;
  }

  /** A 256x240 canvas for a whole screen. */
  screen(ctx: RenderCtx, screenId: number, flagged: boolean): HTMLCanvasElement {
    const key = `${ctxKey(ctx)}/${screenId}/${flagged ? 1 : 0}`;
    const cached = this.screenCache.get(key);
    if (cached) {
      Graphics.lruTouch(this.screenCache, key, cached, Graphics.SCREEN_CACHE_SIZE);
      return cached;
    }

    const canvas = makeCanvas(SCREEN_PX_WIDTH, SCREEN_PX_HEIGHT);
    const c2d = canvas.getContext('2d')!;
    const image = c2d.createImageData(SCREEN_PX_WIDTH, SCREEN_PX_HEIGHT);
    const words = new Uint32Array(image.data.buffer);

    const tileset = this.rom.tilesets.get(ctx.tileset);
    const paletteIds = [...ctx.palettes, 0x7f];
    const screen = this.rom.screens.get(screenId);

    for (let ty = 0; ty < SCREEN_HEIGHT; ty++) {
      for (let tx = 0; tx < SCREEN_WIDTH; tx++) {
        const metatile =
            this.effectiveMetatile(ctx, screen.tiles[ty << 4 | tx], flagged);
        const paletteId = paletteIds[tileset.attrs[metatile] & 3];
        const palette = this.rom.palettes.get(paletteId);
        const backdrop = abgr(palette.color(0));
        const x0 = tx * METATILE_SIZE;
        const y0 = ty * METATILE_SIZE;
        for (let quad = 0; quad < 4; quad++) {
          const tile = tileset.tiles[quad][metatile];
          const patternId = ctx.patterns[tile & 0x80 ? 1 : 0] << 6 | tile & 0x7f;
          const pixels = this.tilePixels(patternId, paletteId);
          const ox = x0 + ((quad & 1) << 3);
          const oy = y0 + ((quad >> 1) << 3);
          for (let r = 0; r < 8; r++) {
            const row = (oy + r) * SCREEN_PX_WIDTH + ox;
            for (let c = 0; c < 8; c++) {
              const px = pixels[r << 3 | c];
              words[row + c] = px || backdrop;
            }
          }
        }
      }
    }
    c2d.putImageData(image, 0, 0);
    Graphics.lruTouch(this.screenCache, key, canvas, Graphics.SCREEN_CACHE_SIZE);
    return canvas;
  }

  /**
   * An 8x8 sprite tile with colour 0 left transparent, ready to composite onto
   * the map.  `flip` uses the NES attribute bits ($40 horizontal, $80
   * vertical).  Returns null for fully transparent tiles so callers can skip
   * the draw entirely.
   */
  spriteTile(patternId: number, paletteId: number,
             flip: number): HTMLCanvasElement | null {
    const key = (patternId & 0xffff) << 10 | (paletteId & 0xff) << 2 |
                (flip >>> 6 & 3);
    if (this.spriteTileCache.has(key)) return this.spriteTileCache.get(key)!;

    const pattern = this.rom.patterns.get(patternId).flip(flip);
    const palette = this.rom.palettes.get(paletteId);
    const canvas = makeCanvas(8, 8);
    const c2d = canvas.getContext('2d')!;
    const image = c2d.createImageData(8, 8);
    const words = new Uint32Array(image.data.buffer);

    let opaque = false;
    for (let r = 0; r < 8; r++) {
      let hi = pattern.pixels[8 | r] << 1;
      let lo = pattern.pixels[r];
      for (let c = 7; c >= 0; c--) {
        const z = hi & 2 | lo & 1;
        hi >>>= 1;
        lo >>>= 1;
        if (z) {
          words[r << 3 | c] = abgr(palette.color(z));
          opaque = true;
        }
      }
    }
    const result = opaque ? canvas : null;
    if (opaque) c2d.putImageData(image, 0, 0);
    this.spriteTileCache.set(key, result);
    return result;
  }

  /** Data URL for a metatile, handy for CSS backgrounds in the tile picker. */
  metatileDataUrl(ctx: RenderCtx, metatile: number): string {
    return this.metatile(ctx, metatile).toDataURL('image/png');
  }
}
