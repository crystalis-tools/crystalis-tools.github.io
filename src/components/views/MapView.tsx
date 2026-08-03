import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import clsx from 'clsx';
import type {DockviewPanelApi} from 'dockview';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {
  MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent,
} from 'react';
import {hex} from '../../rom/bytes';
import {
  METATILE_SIZE, SCREEN_HEIGHT, SCREEN_PX_HEIGHT, SCREEN_PX_WIDTH, SCREEN_WIDTH,
} from '../../rom/constants';
import type {Location} from '../../rom/location';
import {SpawnType} from '../../rom/locationtables';
import {FLAG_COLOR, flagPoint, pitPoint, renderLocation, type Overlays} from '../../render/maprenderer';
import {
  useStore, type Selection, type SelectionKind, type Tool, type WorkspaceTab,
} from '../../state/store';
import {cloneSelectedEntity, deleteSelectedEntity, MapEntityInlineEditor} from '../panels/MapEntityInlineEditor';
import {describeMapEntity} from '../panels/MapEntityHover';
import {HoverPeek} from '../primitives/HoverPeek';
import {Tooltip} from '../primitives/Tooltip';
import type {Rom} from '../../rom/rom';

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const OVERLAY_OPTIONS: Array<[keyof Overlays | 'flagged' | 'animate', string]> = [
  ['screenGrid', 'Screen grid'],
  ['tileGrid', 'Tile grid'],
  ['sprites', 'Sprites'],
  ['spawnLabels', 'Spawn labels'],
  ['animate', 'Animate sprites'],
  ['entrances', 'Entrances'],
  ['exits', 'Exits'],
  ['flags', 'Event Flag screens'],
  ['pits', 'Pits'],
  ['effects', 'Tile effects'],
  ['flagged', 'Show flagged state'],
];

type DragTarget = {kind: 'spawn' | 'exit' | 'entrance', index: number};
type PanState = {
  pointerId: number, clientX: number, clientY: number,
  scrollLeft: number, scrollTop: number,
};

function steppedZoom(zoom: number, direction: number): number {
  if (direction > 0) return ZOOM_STEPS.find(step => step > zoom) ?? ZOOM_STEPS.at(-1)!;
  return [...ZOOM_STEPS].reverse().find(step => step < zoom) ?? ZOOM_STEPS[0];
}

function entityPoint(loc: Location, kind: SelectionKind, index: number) {
  if (index < 0) return null;
  if (kind === 'spawn') {
    const spawn = loc.spawns[index];
    return spawn && spawn.used ?
        {x: spawn.px + METATILE_SIZE / 2, y: spawn.py + METATILE_SIZE / 2} : null;
  }
  if (kind === 'exit') {
    const exit = loc.exits[index];
    return exit ? {x: exit.px + METATILE_SIZE / 2, y: exit.py + METATILE_SIZE / 2} : null;
  }
  if (kind === 'entrance') {
    const entrance = loc.entrances[index];
    return entrance && entrance.used ?
        {x: entrance.px + METATILE_SIZE / 2, y: entrance.py + METATILE_SIZE / 2} : null;
  }
  if (kind === 'flag') {
    const flag = loc.flags[index];
    return flag ? flagPoint(flag) : null;
  }
  if (kind === 'pit') {
    const pit = loc.pits[index];
    return pit ? pitPoint(pit) : null;
  }
  return null;
}

function selectionLabel(loc: Location, selection: Selection): string {
  if (!selection.kind) return '';
  if (selection.kind === 'spawn') {
    const spawn = loc.spawns[selection.index];
    return spawn ? `${spawn.kind()} ${selection.index}` : '';
  }
  return `${selection.kind[0].toUpperCase()}${selection.kind.slice(1)} ${hex(selection.index)}`;
}

/** Floating popup anchored next to the selected object on the map, replacing
 * the old dedicated "Selection" side panel. Rendered as an absolutely
 * positioned child of the canvas wrapper, so it scrolls/zooms in lockstep
 * with the map underneath it with no extra position tracking. */
function SelectionPopup({rom, loc, selection, anchor, viewport}: {
  rom: Rom, loc: Location, selection: Selection, anchor: {x: number, y: number},
  viewport: {left: number, top: number, width: number, height: number},
}) {
  const popupWidth = 288; // w-72
  const margin = 14;
  // Prefer the right side of the object; flip to the left if that would
  // push the popup past the visible edge of the scroll viewport.
  const flip = anchor.x + margin + popupWidth > viewport.left + viewport.width;
  const left = flip ?
      Math.max(viewport.left + margin, anchor.x - margin - popupWidth) :
      Math.min(anchor.x + margin, viewport.left + viewport.width - margin - popupWidth);
  // Vertically center on the object, clamped to the visible viewport.
  const top = Math.min(Math.max(anchor.y, viewport.top + 4), viewport.top + viewport.height - 4);
  const exit = selection.kind === 'exit' ? loc.exits[selection.index] : undefined;
  const dest = exit?.dest ??
      (selection.kind === 'pit' ? loc.pits[selection.index]?.dest : undefined);
  const spawn = selection.kind === 'spawn' ? loc.spawns[selection.index] : undefined;
  const openAction = dest != null ? {label: 'Open destination', onClick: () => useStore.getState().openLocation(dest, exit?.entrance)} :
      spawn?.isMonster() ? {label: 'Open in Editor', onClick: () => useStore.getState().openEnemy(spawn.monsterId)} :
      spawn?.type === SpawnType.NPC ? {label: 'Open in Editor', onClick: () => useStore.getState().openNpc(spawn.id)} :
      spawn?.isTrigger() ? {label: 'Open in Editor', onClick: () => useStore.getState().openTrigger(spawn.triggerId)} :
      spawn?.isChest() && spawn.id < 0x50 ? {label: 'Open in Editor', onClick: () => useStore.getState().openItem(spawn.id)} :
      selection.kind === 'flag' ? {label: 'Open in Editor', onClick: () => useStore.getState().openFlag(loc.flags[selection.index].flag)} :
      undefined;
  return (
    <div className="absolute z-20 w-72 max-h-[calc(100%-8px)] overflow-auto rounded-lg border border-neutral-700 bg-neutral-900/95 p-3 text-xs text-neutral-300 shadow-2xl"
        style={{left, top, transform: 'translateY(-50%)'}}
        onPointerDown={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-neutral-800 pb-2">
        <span className="text-sm font-semibold text-neutral-100">{selectionLabel(loc, selection)}</span>
        <button type="button" title="Close"
            onClick={() => useStore.setState({selection: {kind: null, index: -1}})}
            className="rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100">
          ×
        </button>
      </div>
      <MapEntityInlineEditor rom={rom} loc={loc} selection={selection} />
      <div className={clsx('flex items-center justify-between gap-2',
          selection.kind !== 'entrance' && 'mt-1 border-t border-neutral-800 pt-2')}>
        <div className="flex items-center gap-2">
          {openAction && (
            <button type="button" onClick={openAction.onClick}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200 hover:border-neutral-500">
              {openAction.label}
            </button>
          )}
          {selection.kind !== 'entrance' && (
            <button type="button" onClick={() => cloneSelectedEntity(loc, selection)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200 hover:border-neutral-500">
              Clone
            </button>
          )}
        </div>
        <button type="button" onClick={() => deleteSelectedEntity(loc, selection)}
            className="rounded-md border border-red-900 bg-red-950/40 px-2 py-1 text-red-300 hover:border-red-700 hover:bg-red-950">
          Delete
        </button>
      </div>
    </div>
  );
}

/** Flags/pits aren't drag targets, just click targets - a screen-sized label
 * box for flags, a small badge radius for pits, matching what's drawn. */
function hitTestStatic(loc: Location, px: number, py: number):
    {kind: 'flag' | 'pit', index: number} | null {
  for (let index = loc.pits.length - 1; index >= 0; index--) {
    const {x, y} = pitPoint(loc.pits[index]);
    if (Math.abs(x - px) <= 10 && Math.abs(y - py) <= 10) return {kind: 'pit', index};
  }
  for (let index = loc.flags.length - 1; index >= 0; index--) {
    const flag = loc.flags[index];
    const x = flag.screenX * SCREEN_PX_WIDTH;
    const y = flag.screenY * SCREEN_PX_HEIGHT;
    if (px >= x && px <= x + 94 && py >= y && py <= y + 25) return {kind: 'flag', index};
  }
  return null;
}

function hitTest(loc: Location, px: number, py: number): DragTarget | null {
  const radius = 10;
  for (let index = loc.spawns.length - 1; index >= 0; index--) {
    const spawn = loc.spawns[index];
    if (spawn.used && Math.abs(spawn.px + METATILE_SIZE / 2 - px) <= radius &&
        Math.abs(spawn.py + METATILE_SIZE / 2 - py) <= radius) {
      return {kind: 'spawn', index};
    }
  }
  for (let index = loc.exits.length - 1; index >= 0; index--) {
    const exit = loc.exits[index];
    if (Math.abs(exit.px + METATILE_SIZE / 2 - px) <= radius &&
        Math.abs(exit.py + METATILE_SIZE / 2 - py) <= radius) {
      return {kind: 'exit', index};
    }
  }
  for (let index = loc.entrances.length - 1; index >= 0; index--) {
    const entrance = loc.entrances[index];
    if (entrance.used && Math.abs(entrance.px + METATILE_SIZE / 2 - px) <= radius &&
        Math.abs(entrance.py + METATILE_SIZE / 2 - py) <= radius) {
      return {kind: 'entrance', index};
    }
  }
  return null;
}

function cellAt(loc: Location, px: number, py: number) {
  const sx = Math.floor(px / SCREEN_PX_WIDTH);
  const sy = Math.floor(py / SCREEN_PX_HEIGHT);
  if (sx < 0 || sy < 0 || sx >= loc.width || sy >= loc.height) return null;
  const tx = Math.floor((px - sx * SCREEN_PX_WIDTH) / METATILE_SIZE);
  const ty = Math.floor((py - sy * SCREEN_PX_HEIGHT) / METATILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= SCREEN_WIDTH || ty >= SCREEN_HEIGHT) return null;
  return {sx, sy, tx, ty};
}

function ToolSelector({tool}: {tool: Tool}) {
  const choose = (next: Tool) => useStore.setState({
    tool: next,
    inspectorTab: next === 'paint' ? 'tiles' : 'map',
  });
  return (
    <ToggleGroup.Root type="single" value={tool === 'paint' ? 'paint' : 'select'}
        onValueChange={value => { if (value) choose(value as Tool); }}
        aria-label="Map editing mode"
        className="flex rounded-lg border border-neutral-700 bg-neutral-900 p-1">
      {([['select', 'Select Mode'], ['paint', 'Paint Mode']] as const).map(([value, label]) => (
        <ToggleGroup.Item key={value} value={value}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 data-[state=on]:bg-neutral-700 data-[state=on]:text-neutral-100 data-[state=on]:shadow-sm">
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

function ViewOptions({overlays, flagged, animate}: {
  overlays: Overlays, flagged: boolean, animate: boolean,
}) {
  const enabled = (key: keyof Overlays | 'flagged' | 'animate') =>
    key === 'flagged' ? flagged : key === 'animate' ? animate : overlays[key];
  const toggle = (key: keyof Overlays | 'flagged' | 'animate') => {
    const state = useStore.getState();
    if (key === 'flagged') useStore.setState({showFlagged: !state.showFlagged});
    else if (key === 'animate') useStore.setState({animate: !state.animate});
    else useStore.setState({overlays: {...state.overlays, [key]: !state.overlays[key]}});
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-500">
          View Options
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={5}
            className="z-50 min-w-52 rounded-lg border border-neutral-700 bg-neutral-900 p-1.5 shadow-2xl">
          {OVERLAY_OPTIONS.map(([key, label]) => (
            <DropdownMenu.CheckboxItem key={key} checked={enabled(key)}
                onSelect={event => event.preventDefault()}
                onCheckedChange={() => toggle(key)}
                className="relative cursor-pointer rounded py-2 pl-8 pr-3 text-sm text-neutral-200 outline-none data-[highlighted]:bg-blue-500/20">
              <DropdownMenu.ItemIndicator className="absolute left-2.5">✓</DropdownMenu.ItemIndicator>
              {label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type LocationTab = Extract<WorkspaceTab, {kind: 'location'}>;

export function MapView({tab, panelApi}: {tab: LocationTab, panelApi?: DockviewPanelApi}) {
  const locId = tab.id;
  const rom = useStore(s => s.rom);
  const tool = useStore(s => s.tool);
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const setZoom = useCallback((next: number) => {
    zoomRef.current = next;
    setZoomState(next);
  }, []);
  const overlays = useStore(s => s.overlays);
  const showFlagged = useStore(s => s.showFlagged);
  const animate = useStore(s => s.animate);
  const selection = useStore(s => s.selection);
  const pingTarget = useStore(s => s.pingTarget);
  const revision = useStore(s => s.revision);
  const loc = rom ? rom.location(locId) : null;

  const bodyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const dragging = useRef<DragTarget | null>(null);
  const panning = useRef<PanState | null>(null);
  const frame = useRef(0);
  const hasFit = useRef(false);
  // Set right before a selection change caused by clicking the object on the
  // map itself, so the recentering effect below skips it - clicking an
  // object that's already visible shouldn't jump the viewport out from
  // under the cursor. Only selecting from the Entities side panel recenters.
  const suppressCenter = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<
      {kind: 'spawn' | 'exit' | 'entrance' | 'flag' | 'pit', index: number, clientX: number, clientY: number} | null>(null);
  // Dockview keeps every open tab's component mounted (just detaches its DOM
  // when not the active tab in its group), so without this a background tab
  // with sprite animation on keeps redrawing on its own timer forever - with
  // several map tabs open that's several full-map repaints ticking at once.
  const [visible, setVisible] = useState(panelApi?.isVisible ?? true);
  useEffect(() => {
    if (!panelApi) return;
    setVisible(panelApi.isVisible);
    const disposable = panelApi.onDidVisibilityChange(event => setVisible(event.isVisible));
    return () => disposable.dispose();
  }, [panelApi]);

  // Dockview detaches this panel's DOM when backgrounded, which loses the
  // scrollLeft/scrollTop the browser was tracking - save it continuously and
  // restore it once the panel (and its DOM) comes back.
  const scrollPos = useRef({left: 0, top: 0});
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onScroll = () => {
      scrollPos.current = {left: body.scrollLeft, top: body.scrollTop};
    };
    body.addEventListener('scroll', onScroll, {passive: true});
    return () => body.removeEventListener('scroll', onScroll);
  }, [loc]);
  useEffect(() => {
    const body = bodyRef.current;
    if (!visible || !body || !hasFit.current) return;
    body.scrollLeft = scrollPos.current.left;
    body.scrollTop = scrollPos.current.top;
  }, [visible]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const state = useStore.getState();
    const current = state.rom ? state.rom.location(locId) : null;
    if (!canvas || !current || !state.graphics) return;
    // Tile art is nearest-neighbour pixel art and gains nothing from device
    // pixel ratio; only grid lines/text do. Uncapped, a hidpi screen at max
    // zoom (4x) could demand an 8x-native backing store - slow to build and
    // rebuilt from scratch on every zoom step. Capping keeps that in check
    // while still matching the zoom-only resolution at zoom's own max step.
    const scale = Math.min(zoomRef.current * (window.devicePixelRatio || 1), ZOOM_STEPS.at(-1)!);
    renderLocation(state.graphics, current, canvas, state.overlays,
                   state.showFlagged, frame.current, scale);
    const point = entityPoint(current, state.selection.kind, state.selection.index);
    if (point) {
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = state.selection.kind === 'flag' ? FLAG_COLOR : '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(point.x - 10, point.y - 10, 20, 20);
      ctx.setLineDash([]);
    }
    canvas.style.width = `${current.pxWidth * zoomRef.current}px`;
    canvas.style.height = `${current.pxHeight * zoomRef.current}px`;
  }, [locId]);

  useLayoutEffect(() => {
    // Skip repaints while backgrounded; the redraw below (keyed on `visible`)
    // catches the tab up as soon as it's shown again.
    if (loc && visible) redraw();
  }, [loc, zoom, overlays, showFlagged, selection, revision, redraw, visible]);

  useEffect(() => {
    if (!loc || !animate || !overlays.sprites || !visible) {
      frame.current = 0;
      return;
    }
    const handle = window.setInterval(() => {
      frame.current = (frame.current + 2) & 0xff;
      redraw();
    }, 100);
    return () => window.clearInterval(handle);
  }, [loc, animate, overlays.sprites, redraw]);

  // Center the viewport on a newly selected object (spawn/exit/entrance/etc)
  // so it's easy to find regardless of where it was selected from (map click,
  // Entities tab list, ...). Inactive spawns/entrances have no real position
  // (entityPoint returns null), so leave the viewport alone for those.
  useEffect(() => {
    if (!loc || !selection.kind) return;
    const point = entityPoint(loc, selection.kind, selection.index);
    const body = bodyRef.current;
    if (!point || !body) return;
    const px = point.x * zoomRef.current;
    const py = point.y * zoomRef.current;
    if (suppressCenter.current) {
      // Map-click selection: nudge into view only if it's actually outside
      // the viewport, instead of recentering on it.
      suppressCenter.current = false;
      const margin = 16;
      if (px < body.scrollLeft + margin) body.scrollLeft = px - margin;
      else if (px > body.scrollLeft + body.clientWidth - margin) body.scrollLeft = px + margin - body.clientWidth;
      if (py < body.scrollTop + margin) body.scrollTop = py - margin;
      else if (py > body.scrollTop + body.clientHeight - margin) body.scrollTop = py + margin - body.clientHeight;
      return;
    }
    body.scrollLeft = px - body.clientWidth / 2;
    body.scrollTop = py - body.clientHeight / 2;
  }, [selection.kind, selection.index, loc]);

  const fitToView = useCallback(() => {
    const body = bodyRef.current;
    const state = useStore.getState();
    const current = state.rom ? state.rom.location(locId) : null;
    if (!body || !current) return false;
    const width = body.clientWidth - 48;
    const height = body.clientHeight - 48;
    if (width <= 0 || height <= 0) return false;
    const room = Math.min(width / current.pxWidth, height / current.pxHeight);
    let next = ZOOM_STEPS[0];
    for (const step of ZOOM_STEPS) if (step <= room) next = step;
    setZoom(next);
    requestAnimationFrame(() => {
      // A selection click racing the auto-fit loop can land its scroll before
      // this rAF fires, which would otherwise clobber it back to map-center.
      if (useStore.getState().selection.kind) return;
      body.scrollLeft = (body.scrollWidth - body.clientWidth) / 2;
      body.scrollTop = (body.scrollHeight - body.clientHeight) / 2;
    });
    return true;
  }, [locId, setZoom]);

  // Auto-fit the zoom once, the first time this map is shown.
  useLayoutEffect(() => {
    if (!loc || hasFit.current) return;
    let frameHandle = 0;
    const attempt = () => {
      if (fitToView()) hasFit.current = true;
      else frameHandle = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frameHandle);
  }, [loc, fitToView]);

  // Ping highlights (e.g. jumping to an exit's destination entrance) fade
  // out on their own rather than staying selected/opening an editor popup.
  useEffect(() => {
    if (!pingTarget) return;
    const timeout = setTimeout(() => useStore.getState().setPingTarget(null), 3000);
    return () => clearTimeout(timeout);
  }, [pingTarget]);

  function toPixel(event: {clientX: number, clientY: number}) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const currentZoom = zoomRef.current;
    return {
      x: Math.floor((event.clientX - rect.left) / currentZoom),
      y: Math.floor((event.clientY - rect.top) / currentZoom),
    };
  }

  function metatileAt(current: Location, px: number, py: number) {
    const cell = cellAt(current, px, py);
    if (!cell) return null;
    const state = useStore.getState();
    return state.rom!.screens.get(current.screenAt(cell.sx, cell.sy)).get(cell.tx, cell.ty);
  }

  function pickTile(current: Location, px: number, py: number) {
    const tile = metatileAt(current, px, py);
    if (tile == null) return;
    useStore.setState({selectedMetatile: tile, inspectorTab: 'tiles'});
    useStore.getState().setStatus(`Picked metatile 0x${hex(tile)}`);
  }

  function paintAt(current: Location, px: number, py: number) {
    const cell = cellAt(current, px, py);
    if (!cell) return;
    const state = useStore.getState();
    const screenId = current.screenAt(cell.sx, cell.sy);
    const screen = state.rom!.screens.get(screenId);
    if (screen.get(cell.tx, cell.ty) === state.selectedMetatile) return;
    state.touchScreen(screenId);
    screen.set(cell.tx, cell.ty, state.selectedMetatile);
    state.graphics?.invalidateScreens();
    redraw();
  }

  function updateHover(current: Location, px: number, py: number) {
    const cell = cellAt(current, px, py);
    if (!cell) return;
    const state = useStore.getState();
    const screenId = current.screenAt(cell.sx, cell.sy);
    const metatile = state.rom!.screens.get(screenId).get(cell.tx, cell.ty);
    const info = `screen (0x${hex(cell.sx, 1)},0x${hex(cell.sy, 1)}) = 0x${hex(screenId, 3)}  ` +
        `tile (${cell.tx},${cell.ty}) = 0x${hex(metatile)}`;
    if (info !== state.hoverInfo) state.setHoverInfo(info);
  }

  function moveEntity(current: Location, target: DragTarget, px: number, py: number) {
    const sx = Math.floor(px / SCREEN_PX_WIDTH);
    const sy = Math.floor(py / SCREEN_PX_HEIGHT);
    if (sx < 0 || sy < 0 || sx >= current.width || sy >= current.height) return;
    const ox = px - sx * SCREEN_PX_WIDTH;
    const oy = py - sy * SCREEN_PX_HEIGHT;
    if (target.kind === 'spawn') {
      const spawn = current.spawns[target.index];
      if (!spawn) return;
      spawn.xt = sx << 4 | Math.min(0xf, Math.floor(ox / METATILE_SIZE));
      spawn.yt = sy << 4 | Math.min(0xe, Math.floor(oy / METATILE_SIZE));
    } else if (target.kind === 'exit') {
      const exit = current.exits[target.index];
      if (!exit) return;
      exit.xt = sx << 4 | Math.min(0xf, Math.floor(ox / METATILE_SIZE));
      exit.yt = sy << 4 | Math.min(0xe, Math.floor(oy / METATILE_SIZE));
    } else {
      const entrance = current.entrances[target.index];
      if (!entrance) return;
      entrance.x = sx << 8 | Math.min(0xf, Math.floor(ox / METATILE_SIZE)) * METATILE_SIZE;
      entrance.y = sy << 8 | Math.min(0xe, Math.floor(oy / METATILE_SIZE)) * METATILE_SIZE;
    }
    redraw();
  }

  function zoomAt(next: number, clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const body = bodyRef.current;
    const oldZoom = zoomRef.current;
    if (!canvas || !body || next === oldZoom) return;
    const before = canvas.getBoundingClientRect();
    const mapX = (clientX - before.left) / oldZoom;
    const mapY = (clientY - before.top) / oldZoom;
    setZoom(next);
    redraw();
    const after = canvas.getBoundingClientRect();
    body.scrollLeft += after.left + mapX * next - clientX;
    body.scrollTop += after.top + mapY * next - clientY;
  }

  function onWheel(event: WheelEvent) {
    if (!loc || event.deltaY === 0) return;
    event.preventDefault();
    const currentZoom = zoomRef.current;
    zoomAt(steppedZoom(currentZoom, event.deltaY < 0 ? 1 : -1), event.clientX, event.clientY);
  }

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.addEventListener('wheel', onWheel, {passive: false});
    return () => body.removeEventListener('wheel', onWheel);
  }, [loc]);

  function onContextMenu(event: ReactMouseEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const state = useStore.getState();
    const current = state.rom ? state.rom.location(locId) : null;
    if (!current) return;
    const at = toPixel(event);
    pickTile(current, at.x, at.y);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const state = useStore.getState();
    const current = state.rom ? state.rom.location(locId) : null;
    if (!current || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHoverTarget(null);
    const at = toPixel(event);
    if (state.tool === 'paint' && !event.altKey) {
      painting.current = true;
      state.begin('Paint tiles');
      paintAt(current, at.x, at.y);
      return;
    }
    if (state.tool === 'paint') {
      pickTile(current, at.x, at.y);
      return;
    }
    const hit = hitTest(current, at.x, at.y);
    if (hit) {
      suppressCenter.current = true;
      useStore.setState({selection: hit});
      dragging.current = hit;
      state.begin(`Move ${hit.kind}`);
    } else if (hitTestStatic(current, at.x, at.y)) {
      suppressCenter.current = true;
      useStore.setState({selection: hitTestStatic(current, at.x, at.y)!});
    } else {
      suppressCenter.current = false;
      useStore.setState({selection: {kind: null, index: -1}});
      const body = bodyRef.current!;
      panning.current = {
        pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
        scrollLeft: body.scrollLeft, scrollTop: body.scrollTop,
      };
      setIsPanning(true);
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const state = useStore.getState();
    const current = state.rom ? state.rom.location(locId) : null;
    if (!current) return;
    const at = toPixel(event);
    if (painting.current) {
      updateHover(current, at.x, at.y);
      paintAt(current, at.x, at.y);
    } else if (dragging.current) {
      updateHover(current, at.x, at.y);
      moveEntity(current, dragging.current, at.x, at.y);
    } else if (panning.current?.pointerId === event.pointerId) {
      event.preventDefault();
      const body = bodyRef.current!;
      body.scrollLeft = panning.current.scrollLeft + panning.current.clientX - event.clientX;
      body.scrollTop = panning.current.scrollTop + panning.current.clientY - event.clientY;
    } else {
      updateHover(current, at.x, at.y);
      if (state.tool === 'select') {
        const hit = hitTest(current, at.x, at.y) ?? hitTestStatic(current, at.x, at.y);
        setHoverTarget(hit ? {...hit, clientX: event.clientX, clientY: event.clientY} : null);
      }
    }
  }

  function finishGesture() {
    if (painting.current || dragging.current) useStore.getState().commit();
    painting.current = false;
    dragging.current = null;
    panning.current = null;
    setIsPanning(false);
  }

  function step(direction: number) {
    setZoom(steppedZoom(zoomRef.current, direction));
  }

  void revision;
  if (!loc) return <div className="h-full" />;
  const selectionPoint = selection.kind ?
      entityPoint(loc, selection.kind, selection.index) ??
      // Inactive spawns/entrances have no real position - center the popup
      // instead of anchoring to garbage coordinates or hiding it.
      {x: loc.pxWidth / 2, y: loc.pxHeight / 2} :
      null;
  const pingPoint = pingTarget ? entityPoint(loc, pingTarget.kind, pingTarget.index) : null;
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-4 px-5 py-4">
        <h2 className="truncate text-xl font-semibold">{loc.label}</h2>
        <div className="flex-1" />
        <ToolSelector tool={tool} />
        <ViewOptions overlays={overlays} flagged={showFlagged} animate={animate} />
      </div>
      <div ref={bodyRef}
          className="grid min-h-0 flex-1 overflow-auto bg-[#070a0f] p-8 [place-content:safe_center] [background-image:linear-gradient(45deg,#0d1219_25%,transparent_25%),linear-gradient(-45deg,#0d1219_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#0d1219_75%),linear-gradient(-45deg,transparent_75%,#0d1219_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0] [background-size:16px_16px]">
        <div className="relative inline-block shadow-[0_0_0_1px_#2a3444,0_24px_60px_rgba(0,0,0,0.6)]">
          <canvas ref={canvasRef}
              onContextMenu={onContextMenu}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
              onPointerLeave={() => { useStore.getState().setHoverInfo(''); setHoverTarget(null); }}
              className={clsx(
                  'block touch-none [image-rendering:pixelated]',
                  tool === 'select' ? isPanning ? 'cursor-grabbing' : 'cursor-grab' : 'cursor-crosshair')} />
          {pingPoint && (
            <div className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 animate-tile-blink bg-amber-400/70"
                style={{
                  left: pingPoint.x * zoom, top: pingPoint.y * zoom,
                  width: METATILE_SIZE * zoom, height: METATILE_SIZE * zoom,
                }} />
          )}
          {rom && selection.kind && selectionPoint && (() => {
            const canvasRect = canvasRef.current?.getBoundingClientRect();
            const bodyRect = bodyRef.current?.getBoundingClientRect();
            const viewport = canvasRect && bodyRect ? {
              left: bodyRect.left - canvasRect.left, top: bodyRect.top - canvasRect.top,
              width: bodyRect.width, height: bodyRect.height,
            } : {left: 0, top: 0, width: loc.pxWidth * zoom, height: loc.pxHeight * zoom};
            return (
              <SelectionPopup rom={rom} loc={loc} selection={selection}
                  anchor={{x: selectionPoint.x * zoom, y: selectionPoint.y * zoom}}
                  viewport={viewport} />
            );
          })()}
        </div>
      </div>
      {rom && loc && hoverTarget && !isPanning &&
          !(selection.kind === hoverTarget.kind && selection.index === hoverTarget.index) &&
          (() => {
            const info = describeMapEntity(rom, loc, hoverTarget.kind, hoverTarget.index);
            return info && (
              <HoverPeek title={info.title} lines={info.lines}
                  x={hoverTarget.clientX} y={hoverTarget.clientY} />
            );
          })()}
      <div className="absolute bottom-5 right-5 z-10 flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 p-1.5 shadow-lg">
        <Tooltip content="Zoom out">
          <button type="button" onClick={() => step(-1)} className="size-9 rounded-lg border border-neutral-700 text-lg text-neutral-300 hover:border-neutral-500">−</button>
        </Tooltip>
        <button type="button" title="Zoom to fit" onClick={() => fitToView()}
            className="min-w-16 rounded px-1 py-1 font-mono text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
          {Math.round(zoom * 100)}%
        </button>
        <Tooltip content="Zoom in">
          <button type="button" onClick={() => step(1)} className="size-9 rounded-lg border border-neutral-700 text-lg text-neutral-300 hover:border-neutral-500">+</button>
        </Tooltip>
      </div>
    </div>
  );
}
