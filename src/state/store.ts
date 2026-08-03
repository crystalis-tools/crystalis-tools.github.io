import {create} from 'zustand';
import {NUM_ITEMS} from '../rom/constants';
import type {Location} from '../rom/location';
import {Entrance, Exit, Flag, Pit, Spawn} from '../rom/locationtables';
import type {DialogEntry, Npc} from '../rom/objects';
import type {Rom} from '../rom/rom';
import type {InnEntry, ShopEntry} from '../rom/shop';
import type {Tileset} from '../rom/tileset';
import type {Trigger} from '../rom/trigger';
import {Graphics} from '../render/graphics';
import {DEFAULT_OVERLAYS, Overlays} from '../render/maprenderer';

export type Tool = 'select' | 'paint' | 'pick';
export type InspectorTab = 'map' | 'tiles' | 'spawns';
export type SelectionKind = 'spawn' | 'exit' | 'entrance' | 'flag' | 'pit' | null;

export interface Selection {
  kind: SelectionKind;
  index: number;
}

/** A shop editor tab: one armor/tool/inn shop at a town index, or the single
 *  global pawn-price tab. */
export type ShopTab =
  | {shopType: 'armor' | 'tool' | 'inn', town: number}
  | {shopType: 'pawn'};

/** Everything that can occupy a workspace tab. */
export type WorkspaceTab =
  | {kind: 'location', id: number}
  | ({kind: 'shop'} & ShopTab)
  | {kind: 'items'}
  | {kind: 'enemies'}
  | {kind: 'npc', id: number}
  | {kind: 'flags'}
  | {kind: 'trigger', id: number}
  | {kind: 'messages'}
  | {kind: 'settings'};

/** Stable identity for a tab, used for comparisons and closing. */
export function tabKey(tab: WorkspaceTab): string {
  if (tab.kind === 'location') return `loc:${tab.id}`;
  if (tab.kind === 'items') return 'items';
  if (tab.kind === 'enemies') return 'enemies';
  if (tab.kind === 'npc') return `npc:${tab.id}`;
  if (tab.kind === 'flags') return 'flags';
  if (tab.kind === 'trigger') return `trigger:${tab.id}`;
  if (tab.kind === 'messages') return 'messages';
  if (tab.kind === 'settings') return 'settings';
  if (tab.shopType === 'pawn') return 'shop:pawn';
  return `shop:${tab.shopType}:${tab.town}`;
}

/** A reversible snapshot of everything the editors can change on a location. */
interface LocationSnapshot {
  bgm: number;
  width: number;
  height: number;
  animation: number;
  plane: number;
  screens: number[][];
  tilePalettes: [number, number, number];
  tileset: number;
  tileEffects: number;
  tilePatterns: [number, number];
  spritePalettes: [number, number];
  spritePatterns: [number, number];
  entrances: number[][];
  exits: number[][];
  flags: number[][];
  pits: number[][];
  spawns: number[][];
  checkpoint: boolean;
  saveable: boolean;
}

/** A reversible snapshot of everything the shop editor can change. */
interface ShopsSnapshot {
  armorShops: ShopEntry[];
  toolShops: ShopEntry[];
  inns: InnEntry[];
  sellPrices: number[];
}

/** A reversible snapshot of the stats the enemies editor can change, indexed
 *  by object id (0-255). */
type ObjectsSnapshot = Array<{
  hp: number, atk: number, def: number, metasprite: number,
  speed: number, collisionPlane: number, level: number, poison: boolean,
  child: number, terrainSusceptibility: number, immobile: boolean,
  replacement: number, goldDrop: number, elements: number, expReward: number,
  attackType: number, statusEffect: number,
}>;

/** A reversible snapshot of the appearance byte the NPCs editor can change,
 *  indexed by NPC id (0-255). */
type NpcsSnapshot = number[];

/** A reversible snapshot of the icon table the items editor can change,
 *  indexed by item id. */
type ItemIconsSnapshot = number[];

/** A reversible snapshot of the item name table, indexed by item id. */
type ItemNamesSnapshot = string[];

/** A reversible deep-clone of one NPC's dialogue tree - structural edits
 *  (add/remove/reorder lines, edit condition/flags/message) all go through
 *  a whole-NPC snapshot rather than per-field tracking, since the shape of
 *  what changed varies too much to track piecemeal. */
interface NpcDialogSnapshot {
  global: DialogEntry[];
  local: Array<[number, DialogEntry[]]>;
}

/** A reversible deep-clone of one NPC's location-keyed visibility rules. */
type NpcVisibilitySnapshot = Array<[number, number[]]>;

/** A reversible deep-clone of one trigger's conditions/message/flags. */
interface TriggerSnapshot {
  conditions: number[];
  message: {part: number, index: number};
  flags: number[];
}

/** A reversible snapshot of the flag/defense tables the items editor can
 *  change, indexed by item id (defense entries are 0 for non-equipment). */
interface ItemStatsSnapshot {
  palette: number[];
  unique: boolean[];
  worn: boolean[];
  solid: boolean[];
  shieldDefense: number[];
  armorDefense: number[];
}

/** Mutable data owned by one shared tileset. */
interface TilesetSnapshot {
  tiles: number[][];
  attrs: number[];
  alternates: number[];
}

/**
 * One undoable transaction.  Screen tile data is snapshotted separately
 * because screens are shared between locations - painting a tile in one map
 * changes every map that uses that screen. Shared tables and shops are
 * snapshotted lazily when an editor declares that it will mutate them.
 */
interface Transaction {
  label: string;
  locationId: number | null;
  locBefore: LocationSnapshot | null;
  locAfter?: LocationSnapshot | null;
  locChanged?: boolean;
  screensBefore: Map<number, number[]>;
  screensAfter?: Map<number, number[]>;
  tilesetsBefore: Map<number, TilesetSnapshot>;
  tilesetsAfter?: Map<number, TilesetSnapshot>;
  shopsBefore: ShopsSnapshot | null;
  shopsAfter?: ShopsSnapshot | null;
  objectsBefore: ObjectsSnapshot | null;
  objectsAfter?: ObjectsSnapshot | null;
  npcsBefore: NpcsSnapshot | null;
  npcsAfter?: NpcsSnapshot | null;
  itemIconsBefore: ItemIconsSnapshot | null;
  itemIconsAfter?: ItemIconsSnapshot | null;
  itemStatsBefore: ItemStatsSnapshot | null;
  itemStatsAfter?: ItemStatsSnapshot | null;
  itemNamesBefore: ItemNamesSnapshot | null;
  itemNamesAfter?: ItemNamesSnapshot | null;
  /** Text of edited messages, keyed by `"part,index"`. Touched lazily per
   *  message rather than as a whole-table snapshot - there are hundreds of
   *  messages and a typical edit touches one. */
  messagesBefore: Map<string, string>;
  messagesAfter?: Map<string, string>;
  /** Whole-NPC dialogue snapshots, keyed by NPC id - touched lazily like
   *  `screensBefore`/`tilesetsBefore`. */
  npcDialogBefore: Map<number, NpcDialogSnapshot>;
  npcDialogAfter?: Map<number, NpcDialogSnapshot>;
  /** Per-NPC visibility snapshots, kept separate from dialogue so editing
   *  either table only repacks the ROM region it owns. */
  npcVisibilityBefore: Map<number, NpcVisibilitySnapshot>;
  npcVisibilityAfter?: Map<number, NpcVisibilitySnapshot>;
  /** Trigger snapshots, keyed by trigger id - touched lazily like
   *  `npcDialogBefore`. */
  triggersBefore: Map<number, TriggerSnapshot>;
  triggersAfter?: Map<number, TriggerSnapshot>;
}

const UNDO_LIMIT = 200;

export interface StoreState {
  rom: Rom | null;
  graphics: Graphics | null;
  /** Name of the BPS patch last loaded or saved, used to default the save filename. */
  patchFileName: string | null;
  /** Bumped on every in-place mutation of `rom`/`graphics` (edit/undo/redo),
   *  since those are large object graphs mutated in place - select this
   *  alongside `rom` to re-render on ROM changes. */
  revision: number;

  /** Open tabs (maps and shops), in tab order. */
  tabs: WorkspaceTab[];
  activeTabKey: string | null;

  tool: Tool;
  selectedMetatile: number;
  overlays: Overlays;
  /** Render screens as if their flag were set. */
  showFlagged: boolean;
  /** Run the sprite animation loop. */
  animate: boolean;
  inspectorTab: InspectorTab;
  explorerFilter: string;
  /** Item id to scroll to and highlight when the items tab is active. */
  focusItemId: number | null;
  /** Monster id to scroll to and highlight when the enemies tab is active. */
  focusEnemyId: number | null;
  /** Flag id to scroll to and highlight when the flags tab is active. */
  focusFlagId: number | null;
  /** Message "part:index" to scroll to and highlight when the messages tab
   *  is active. */
  focusMessageId: string | null;
  selection: Selection;
  status: string;
  /** Transient hover readout shown in the status bar. */
  hoverInfo: string;
  /** Entity to briefly ping-highlight on the map without selecting/opening
   *  its editor popup, e.g. after jumping to an exit's destination. */
  pingTarget: Selection | null;

  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;

  setStatus(message: string): void;
  setHoverInfo(info: string): void;
  setPingTarget(target: Selection | null): void;

  /** Install a freshly loaded (or freshly patched) ROM, resetting tabs and
   *  undo history. */
  loadRom(rom: Rom, graphics: Graphics, patchFileName: string | null, status: string): void;

  // ----------------------------------------------------------------- tabs
  openLocation(id: number, entrance?: number): void;
  openShop(shop: ShopTab): void;
  openItem(id: number): void;
  openEnemy(id: number): void;
  openNpc(id: number): void;
  openFlag(id: number): void;
  openTrigger(id: number): void;
  openMessage(part: number, index: number): void;
  /** Open the settings tab. */
  openSettings(): void;
  /** Set editor-only project metadata. Stored in BPS metadata, never ROM. */
  setProjectSettings(name: string, version: string): void;
  /** Toggle an Engine Tweak by id. */
  setEngineTweak(id: string, enabled: boolean): void;
  closeTab(key: string): void;
  closeAllTabs(): void;
  closeOtherTabs(key: string): void;
  closeTabsToRight(key: string): void;

  // ----------------------------------------------------------------- undo
  /** Open a transaction. Nested calls coalesce into the outermost one. */
  begin(label: string): void;
  /** Record a screen's tiles before mutating it. */
  touchScreen(id: number): void;
  /** Record a shared tileset before mutating it. */
  touchTileset(id: number): void;
  /** Record the global shop tables before mutating them. */
  touchShops(): void;
  /** Record every object's editable stats before mutating them. */
  touchObjects(): void;
  /** Record every NPC's appearance byte before mutating it. */
  touchNpcs(): void;
  /** Record the item icon table before mutating it. */
  touchItemIcons(): void;
  /** Record the item flag/defense tables before mutating them. */
  touchItemStats(): void;
  /** Record the item name table before mutating it. */
  touchItemNames(): void;
  /** Record one message's text before mutating it. */
  touchMessage(part: number, index: number): void;
  /** Record one NPC's whole dialogue tree before a structural edit. */
  touchNpcDialog(id: number): void;
  /** Record one NPC's location-keyed visibility rules before an edit. */
  touchNpcVisibility(id: number): void;
  /** Record one trigger's conditions/message/flags before a structural edit. */
  touchTrigger(id: number): void;
  /** Close the transaction, discarding it if nothing actually changed. */
  commit(): void;
  /** Run a mutation inside its own transaction. */
  edit(label: string, mutate: () => void): void;
  undo(): void;
  redo(): void;
  clearHistory(): void;
}

/** Creates an independent store instance. The app uses the `useStore`
 *  singleton below; tests use this directly to get isolated undo history
 *  per `Rom` under test. */
export function createIdeStore() {
  return create<StoreState>((set, get) => {
  // Undo-engine internals. Not part of reactive state - `canUndo`/`canRedo`/
  // `undoLabel`/`redoLabel` mirror them into state whenever they change.
  let undoStack: Transaction[] = [];
  let redoStack: Transaction[] = [];
  let current: Transaction | null = null;
  let depth = 0;

  function syncUndoState() {
    set({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoLabel: undoStack[undoStack.length - 1]?.label ?? '',
      redoLabel: redoStack[redoStack.length - 1]?.label ?? '',
    });
  }

  function openTabInternal(tab: WorkspaceTab) {
    const key = tabKey(tab);
    const tabs = get().tabs;
    set({
      tabs: tabs.some(t => tabKey(t) === key) ? tabs : [...tabs, tab],
      activeTabKey: key,
      selection: {kind: null, index: -1},
    });
  }

  /** Remove all tabs matching `predicate`, keeping the active tab valid. */
  function closeTabsInternal(predicate: (tab: WorkspaceTab, index: number) => boolean) {
    const {tabs, activeTabKey} = get();
    const activeIndex = tabs.findIndex(t => tabKey(t) === activeTabKey);
    const activeRemoved = activeIndex >= 0 && predicate(tabs[activeIndex], activeIndex);
    const nextTabs = tabs.filter((t, i) => !predicate(t, i));
    set({
      tabs: nextTabs,
      activeTabKey: activeRemoved ?
          (nextTabs[Math.min(activeIndex, nextTabs.length - 1)] ?
              tabKey(nextTabs[Math.min(activeIndex, nextTabs.length - 1)]) : null) :
          activeTabKey,
    });
  }

  function applyTx(
      tx: Transaction, loc: LocationSnapshot | null,
      screens: Map<number, number[]>, tilesets: Map<number, TilesetSnapshot>,
      shops: ShopsSnapshot | null, objects: ObjectsSnapshot | null,
      npcs: NpcsSnapshot | null, itemIcons: ItemIconsSnapshot | null,
      itemStats: ItemStatsSnapshot | null, itemNames: ItemNamesSnapshot | null,
      messages: Map<string, string>, npcDialog: Map<number, NpcDialogSnapshot>,
      npcVisibility: Map<number, NpcVisibilitySnapshot>,
      triggers: Map<number, TriggerSnapshot>) {
    const rom = get().rom;
    if (!rom) return;
    if (tx.locChanged && tx.locationId != null && loc) {
      const location = rom.location(tx.locationId);
      restore(location, loc);
      location.dirty = true;
    }
    for (const [id, tiles] of screens) {
      rom.screens.get(id).tiles = [...tiles];
    }
    for (const [id, snap] of tilesets) {
      restoreTileset(rom.tilesets.get(id), snap);
    }
    if (screens.size || tilesets.size) rom.sharedDataDirty = true;
    if (shops) {
      restoreShops(rom.shops, shops);
      rom.shopsDirty = true;
    }
    if (objects) {
      restoreObjects(rom.objects, objects);
      rom.objectsDirty = true;
    }
    if (npcs) {
      restoreNpcs(rom.npcs, npcs);
      rom.npcsDirty = true;
    }
    if (itemIcons) {
      restoreItemIcons(rom.itemIcons, itemIcons);
      rom.itemIconsDirty = true;
    }
    if (itemStats) {
      restoreItemStats(rom.itemStats, itemStats);
      rom.itemStatsDirty = true;
    }
    if (itemNames) {
      restoreItemNames(rom.itemNames, itemNames);
      rom.itemNamesDirty = true;
    }
    if (messages.size) {
      for (const [key, text] of messages) {
        const [part, index] = key.split(',').map(Number);
        rom.messages.set(part, index, text);
      }
      rom.messagesDirty = true;
    }
    if (npcDialog.size) {
      for (const [id, snap] of npcDialog) restoreNpcDialog(rom.npcs.get(id), snap);
      rom.npcDialogDirty = true;
    }
    if (npcVisibility.size) {
      for (const [id, snap] of npcVisibility) {
        restoreNpcVisibility(rom.npcs.get(id), snap);
      }
      rom.npcVisibilityDirty = true;
    }
    if (triggers.size) {
      for (const [id, snap] of triggers) restoreTrigger(rom.triggers.get(id), snap);
      rom.triggersDirty = true;
    }
    get().graphics?.invalidate();
    if (tx.locationId != null &&
        get().activeTabKey !== tabKey({kind: 'location', id: tx.locationId})) {
      openTabInternal({kind: 'location', id: tx.locationId});
    }
  }

  return {
    rom: null,
    graphics: null,
    patchFileName: null,
    revision: 0,

    tabs: [],
    activeTabKey: null,

    tool: 'select',
    selectedMetatile: 0,
    overlays: {...DEFAULT_OVERLAYS},
    showFlagged: false,
    animate: true,
    inspectorTab: 'map',
    explorerFilter: '',
    focusItemId: null,
    focusEnemyId: null,
    focusFlagId: null,
    focusMessageId: null,
    selection: {kind: null, index: -1},
    pingTarget: null,
    status: 'No ROM loaded',
    hoverInfo: '',

    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',

    setStatus: message => set({status: message}),
    setHoverInfo: info => set({hoverInfo: info}),
    setPingTarget: target => set({pingTarget: target}),

    loadRom: (rom, graphics, patchFileName, status) => {
      set({rom, graphics, patchFileName, tabs: [], activeTabKey: null, revision: 0});
      get().clearHistory();
      get().setStatus(status);
    },

    // --------------------------------------------------------------- tabs
    openLocation: (id, entrance) => {
      openTabInternal({kind: 'location', id});
      if (entrance != null) set({pingTarget: {kind: 'entrance', index: entrance}});
    },
    openShop: shop => openTabInternal({kind: 'shop', ...shop}),
    openItem: id => { openTabInternal({kind: 'items'}); set({focusItemId: id}); },
    openEnemy: id => { openTabInternal({kind: 'enemies'}); set({focusEnemyId: id}); },
    openNpc: id => openTabInternal({kind: 'npc', id}),
    openFlag: id => { openTabInternal({kind: 'flags'}); set({focusFlagId: id}); },
    openTrigger: id => openTabInternal({kind: 'trigger', id}),
    openMessage: (part, index) => {
      openTabInternal({kind: 'messages'});
      set({focusMessageId: `${part}:${index}`});
    },
    openSettings: () => openTabInternal({kind: 'settings'}),
    setProjectSettings: (name, version) => {
      const rom = get().rom;
      if (!rom) return;
      rom.projectSettings.name = name;
      rom.projectSettings.version = version;
      rom.projectDirty = true;
      set(state => ({revision: state.revision + 1}));
    },
    setEngineTweak: (id, enabled) => {
      const rom = get().rom;
      if (!rom) return;
      rom.setEngineTweak(id, enabled);
      set(state => ({revision: state.revision + 1}));
    },
    closeTab: key => closeTabsInternal(t => tabKey(t) === key),
    closeAllTabs: () => closeTabsInternal(() => true),
    closeOtherTabs: key => closeTabsInternal(t => tabKey(t) !== key),
    closeTabsToRight: key => {
      const index = get().tabs.findIndex(t => tabKey(t) === key);
      if (index < 0) return;
      closeTabsInternal((_, i) => i > index);
    },

    // --------------------------------------------------------------- undo
    begin: label => {
      if (!get().rom) return;
      if (depth++ > 0) return;
      const loc = selectActiveLocation(get());
      current = {
        label,
        locationId: loc ? loc.id : null,
        locBefore: loc ? snapshot(loc) : null,
        screensBefore: new Map(),
        tilesetsBefore: new Map(),
        shopsBefore: null,
        objectsBefore: null,
        npcsBefore: null,
        itemIconsBefore: null,
        itemStatsBefore: null,
        itemNamesBefore: null,
        messagesBefore: new Map(),
        npcDialogBefore: new Map(),
        npcVisibilityBefore: new Map(),
        triggersBefore: new Map(),
      };
    },

    touchScreen: id => {
      const rom = get().rom;
      if (!current || !rom) return;
      if (current.screensBefore.has(id)) return;
      current.screensBefore.set(id, [...rom.screens.get(id).tiles]);
    },

    touchTileset: id => {
      const rom = get().rom;
      if (!current || !rom) return;
      if (current.tilesetsBefore.has(id)) return;
      current.tilesetsBefore.set(id, snapshotTileset(rom.tilesets.get(id)));
    },

    touchShops: () => {
      const rom = get().rom;
      if (!current || !rom || current.shopsBefore) return;
      current.shopsBefore = snapshotShops(rom.shops);
    },

    touchObjects: () => {
      const rom = get().rom;
      if (!current || !rom || current.objectsBefore) return;
      current.objectsBefore = snapshotObjects(rom.objects);
    },

    touchNpcs: () => {
      const rom = get().rom;
      if (!current || !rom || current.npcsBefore) return;
      current.npcsBefore = snapshotNpcs(rom.npcs);
    },

    touchItemIcons: () => {
      const rom = get().rom;
      if (!current || !rom || current.itemIconsBefore) return;
      current.itemIconsBefore = snapshotItemIcons(rom.itemIcons);
    },

    touchItemStats: () => {
      const rom = get().rom;
      if (!current || !rom || current.itemStatsBefore) return;
      current.itemStatsBefore = snapshotItemStats(rom.itemStats);
    },

    touchItemNames: () => {
      const rom = get().rom;
      if (!current || !rom || current.itemNamesBefore) return;
      current.itemNamesBefore = snapshotItemNames(rom.itemNames);
    },

    touchMessage: (part, index) => {
      const rom = get().rom;
      if (!current || !rom) return;
      const key = `${part},${index}`;
      if (current.messagesBefore.has(key)) return;
      current.messagesBefore.set(key, rom.messages.get(part, index) ?? '');
    },

    touchNpcDialog: id => {
      const rom = get().rom;
      if (!current || !rom) return;
      if (current.npcDialogBefore.has(id)) return;
      const npc = rom.npcs.get(id);
      if (!npc) return;
      current.npcDialogBefore.set(id, snapshotNpcDialog(npc));
    },

    touchNpcVisibility: id => {
      const rom = get().rom;
      if (!current || !rom || current.npcVisibilityBefore.has(id)) return;
      const npc = rom.npcs.get(id);
      if (!npc) return;
      current.npcVisibilityBefore.set(id, snapshotNpcVisibility(npc));
    },

    touchTrigger: id => {
      const rom = get().rom;
      if (!current || !rom) return;
      if (current.triggersBefore.has(id)) return;
      const trigger = rom.triggers.get(id);
      if (!trigger) return;
      current.triggersBefore.set(id, snapshotTrigger(trigger));
    },

    commit: () => {
      if (depth === 0) return;
      if (--depth > 0) return;
      const tx = current;
      current = null;
      const rom = get().rom;
      if (!tx || !rom) return;

      let locChanged = false;
      if (tx.locationId != null) {
        const loc = rom.location(tx.locationId);
        tx.locAfter = snapshot(loc);
        locChanged = !equal(tx.locBefore, tx.locAfter);
      }
      tx.locChanged = locChanged;
      tx.screensAfter = new Map();
      for (const id of tx.screensBefore.keys()) {
        tx.screensAfter.set(id, [...rom.screens.get(id).tiles]);
      }
      const screensChanged = [...tx.screensBefore].some(
          ([id, before]) => !equal(before, tx.screensAfter!.get(id)));

      tx.tilesetsAfter = new Map();
      for (const id of tx.tilesetsBefore.keys()) {
        tx.tilesetsAfter.set(id, snapshotTileset(rom.tilesets.get(id)));
      }
      const tilesetsChanged = [...tx.tilesetsBefore].some(
          ([id, before]) => !equal(before, tx.tilesetsAfter!.get(id)));

      tx.shopsAfter = tx.shopsBefore ? snapshotShops(rom.shops) : null;
      const shopsChanged = tx.shopsBefore != null && !equal(tx.shopsBefore, tx.shopsAfter);

      tx.objectsAfter = tx.objectsBefore ? snapshotObjects(rom.objects) : null;
      const objectsChanged = tx.objectsBefore != null && !equal(tx.objectsBefore, tx.objectsAfter);

      tx.npcsAfter = tx.npcsBefore ? snapshotNpcs(rom.npcs) : null;
      const npcsChanged = tx.npcsBefore != null && !equal(tx.npcsBefore, tx.npcsAfter);

      tx.itemIconsAfter = tx.itemIconsBefore ? snapshotItemIcons(rom.itemIcons) : null;
      const itemIconsChanged =
          tx.itemIconsBefore != null && !equal(tx.itemIconsBefore, tx.itemIconsAfter);

      tx.itemStatsAfter = tx.itemStatsBefore ? snapshotItemStats(rom.itemStats) : null;
      const itemStatsChanged =
          tx.itemStatsBefore != null && !equal(tx.itemStatsBefore, tx.itemStatsAfter);

      tx.itemNamesAfter = tx.itemNamesBefore ? snapshotItemNames(rom.itemNames) : null;
      const itemNamesChanged =
          tx.itemNamesBefore != null && !equal(tx.itemNamesBefore, tx.itemNamesAfter);

      tx.messagesAfter = new Map();
      for (const key of tx.messagesBefore.keys()) {
        const [part, index] = key.split(',').map(Number);
        tx.messagesAfter.set(key, rom.messages.get(part, index) ?? '');
      }
      const messagesChanged = [...tx.messagesBefore].some(
          ([key, before]) => before !== tx.messagesAfter!.get(key));

      tx.npcDialogAfter = new Map();
      for (const id of tx.npcDialogBefore.keys()) {
        const npc = rom.npcs.get(id);
        if (npc) tx.npcDialogAfter.set(id, snapshotNpcDialog(npc));
      }
      const npcDialogChanged = [...tx.npcDialogBefore].some(
          ([id, before]) => !equal(before, tx.npcDialogAfter!.get(id)));

      tx.npcVisibilityAfter = new Map();
      for (const id of tx.npcVisibilityBefore.keys()) {
        const npc = rom.npcs.get(id);
        if (npc) tx.npcVisibilityAfter.set(id, snapshotNpcVisibility(npc));
      }
      const npcVisibilityChanged = [...tx.npcVisibilityBefore].some(
          ([id, before]) => !equal(before, tx.npcVisibilityAfter!.get(id)));

      tx.triggersAfter = new Map();
      for (const id of tx.triggersBefore.keys()) {
        const trigger = rom.triggers.get(id);
        if (trigger) tx.triggersAfter.set(id, snapshotTrigger(trigger));
      }
      const triggersChanged = [...tx.triggersBefore].some(
          ([id, before]) => !equal(before, tx.triggersAfter!.get(id)));

      if (!locChanged && !screensChanged && !tilesetsChanged && !shopsChanged &&
          !objectsChanged && !npcsChanged && !itemIconsChanged && !itemStatsChanged &&
          !itemNamesChanged && !messagesChanged && !npcDialogChanged &&
          !npcVisibilityChanged && !triggersChanged) {
        return;
      }

      if (locChanged) rom.location(tx.locationId!).dirty = true;
      if (screensChanged || tilesetsChanged) rom.sharedDataDirty = true;
      if (shopsChanged) rom.shopsDirty = true;
      if (objectsChanged) rom.objectsDirty = true;
      if (npcsChanged) rom.npcsDirty = true;
      if (itemIconsChanged) rom.itemIconsDirty = true;
      if (itemStatsChanged) rom.itemStatsDirty = true;
      if (itemNamesChanged) rom.itemNamesDirty = true;
      if (messagesChanged) rom.messagesDirty = true;
      if (npcDialogChanged) rom.npcDialogDirty = true;
      if (npcVisibilityChanged) rom.npcVisibilityDirty = true;
      if (triggersChanged) rom.triggersDirty = true;
      undoStack.push(tx);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      redoStack = [];
      if (tilesetsChanged) get().graphics?.invalidate();
      else if (screensChanged) get().graphics?.invalidateScreens();
      set(state => ({revision: state.revision + 1}));
      syncUndoState();
    },

    edit: (label, mutate) => {
      get().begin(label);
      try {
        mutate();
      } finally {
        get().commit();
      }
    },

    undo: () => {
      const tx = undoStack.pop();
      if (!tx || !get().rom) return;
      applyTx(tx, tx.locBefore, tx.screensBefore, tx.tilesetsBefore,
              tx.shopsBefore, tx.objectsBefore, tx.npcsBefore,
              tx.itemIconsBefore, tx.itemStatsBefore, tx.itemNamesBefore,
              tx.messagesBefore, tx.npcDialogBefore, tx.npcVisibilityBefore,
              tx.triggersBefore);
      redoStack.push(tx);
      set(state => ({revision: state.revision + 1, status: `Undo: ${tx.label}`}));
      syncUndoState();
    },

    redo: () => {
      const tx = redoStack.pop();
      if (!tx || !tx.screensAfter || !tx.tilesetsAfter || !get().rom) return;
      applyTx(tx, tx.locAfter ?? null, tx.screensAfter, tx.tilesetsAfter,
              tx.shopsAfter ?? null, tx.objectsAfter ?? null,
              tx.npcsAfter ?? null, tx.itemIconsAfter ?? null,
              tx.itemStatsAfter ?? null, tx.itemNamesAfter ?? null,
              tx.messagesAfter ?? new Map(), tx.npcDialogAfter ?? new Map(),
              tx.npcVisibilityAfter ?? new Map(),
              tx.triggersAfter ?? new Map());
      undoStack.push(tx);
      set(state => ({revision: state.revision + 1, status: `Redo: ${tx.label}`}));
      syncUndoState();
    },

    clearHistory: () => {
      undoStack = [];
      redoStack = [];
      current = null;
      depth = 0;
      syncUndoState();
    },
  };
  });
}

export const useStore = createIdeStore();

// ------------------------------------------------------------- selectors

export function selectActiveTab(state: StoreState): WorkspaceTab | null {
  return state.tabs.find(t => tabKey(t) === state.activeTabKey) ?? null;
}

/** Looks up a tab by its stable key, regardless of which tab is active.
 *  Used by per-panel views so a split view of two maps shows each map's own
 *  content instead of whichever tab happens to be globally active. */
export function selectTabByKey(state: StoreState, key: string): WorkspaceTab | null {
  return state.tabs.find(t => tabKey(t) === key) ?? null;
}

export function selectActiveLocation(state: StoreState): Location | null {
  const t = selectActiveTab(state);
  if (state.rom == null || !t || t.kind !== 'location') return null;
  return state.rom.location(t.id);
}

export function selectActiveShopTab(state: StoreState): ShopTab | null {
  const t = selectActiveTab(state);
  return t && t.kind === 'shop' ? t : null;
}

// -------------------------------------------------------- snapshot helpers

function snapshot(loc: Location): LocationSnapshot {
  return {
    bgm: loc.bgm,
    width: loc.width,
    height: loc.height,
    animation: loc.animation,
    plane: loc.plane,
    screens: loc.screens.map(row => [...row]),
    tilePalettes: [...loc.tilePalettes] as [number, number, number],
    tileset: loc.tileset,
    tileEffects: loc.tileEffects,
    tilePatterns: [...loc.tilePatterns] as [number, number],
    spritePalettes: [...loc.spritePalettes] as [number, number],
    spritePatterns: [...loc.spritePatterns] as [number, number],
    entrances: loc.entrances.map(e => [...e.data]),
    exits: loc.exits.map(e => [...e.data]),
    flags: loc.flags.map(f => [...f.data]),
    pits: loc.pits.map(p => [...p.data]),
    spawns: loc.spawns.map(s => [...s.data]),
    checkpoint: loc.checkpoint,
    saveable: loc.saveable,
  };
}

function restore(loc: Location, snap: LocationSnapshot) {
  loc.bgm = snap.bgm;
  loc.width = snap.width;
  loc.height = snap.height;
  loc.animation = snap.animation;
  loc.plane = snap.plane;
  loc.screens = snap.screens.map(row => [...row]);
  loc.tilePalettes = [...snap.tilePalettes] as [number, number, number];
  loc.tileset = snap.tileset;
  loc.tileEffects = snap.tileEffects;
  loc.tilePatterns = [...snap.tilePatterns] as [number, number];
  loc.spritePalettes = [...snap.spritePalettes] as [number, number];
  loc.spritePatterns = [...snap.spritePatterns] as [number, number];
  loc.entrances = snap.entrances.map(d => new Entrance([...d]));
  loc.exits = snap.exits.map(d => new Exit([...d]));
  loc.flags = snap.flags.map(d => new Flag([...d]));
  loc.pits = snap.pits.map(d => new Pit([...d]));
  loc.spawns = snap.spawns.map(d => new Spawn([...d]));
  loc.checkpoint = snap.checkpoint;
  loc.saveable = snap.saveable;
}

function snapshotTileset(tileset: Tileset): TilesetSnapshot {
  return {
    tiles: tileset.tiles.map(row => [...row]),
    attrs: [...tileset.attrs],
    alternates: [...tileset.alternates],
  };
}

function restoreTileset(tileset: Tileset, snap: TilesetSnapshot) {
  tileset.tiles = snap.tiles.map(row => [...row]);
  tileset.attrs = [...snap.attrs];
  tileset.alternates = [...snap.alternates];
}

function snapshotShops(shops: Rom['shops']): ShopsSnapshot {
  return {
    armorShops: shops.armorShops.map(s => ({...s, contents: [...s.contents], buyPrices: [...s.buyPrices]})),
    toolShops: shops.toolShops.map(s => ({...s, contents: [...s.contents], buyPrices: [...s.buyPrices]})),
    inns: shops.inns.map(i => ({...i})),
    sellPrices: [...shops.sellPrices],
  };
}

function restoreShops(shops: Rom['shops'], snap: ShopsSnapshot) {
  shops.armorShops.forEach((s, i) => {
    s.contents = [...snap.armorShops[i].contents];
    s.buyPrices = [...snap.armorShops[i].buyPrices];
  });
  shops.toolShops.forEach((s, i) => {
    s.contents = [...snap.toolShops[i].contents];
    s.buyPrices = [...snap.toolShops[i].buyPrices];
  });
  shops.inns.forEach((s, i) => { s.buyPrice = snap.inns[i].buyPrice; });
  shops.sellPrices.splice(0, shops.sellPrices.length, ...snap.sellPrices);
}

function snapshotObjects(objects: Rom['objects']): ObjectsSnapshot {
  return Array.from({length: 256}, (_, id) => {
    const obj = objects.get(id)!;
    return {
      hp: obj.hp, atk: obj.atk, def: obj.def, metasprite: obj.metasprite,
      speed: obj.speed, collisionPlane: obj.collisionPlane, level: obj.level,
      poison: obj.poison, child: obj.child,
      terrainSusceptibility: obj.terrainSusceptibility, immobile: obj.immobile,
      replacement: obj.replacement, goldDrop: obj.goldDrop,
      elements: obj.elements, expReward: obj.expReward,
      attackType: obj.attackType, statusEffect: obj.statusEffect,
    };
  });
}

function restoreObjects(objects: Rom['objects'], snap: ObjectsSnapshot) {
  snap.forEach((s, id) => {
    const obj = objects.get(id);
    if (!obj) return;
    if (obj.editable('hp')) obj.hp = s.hp;
    if (obj.editable('atk')) obj.atk = s.atk;
    if (obj.editable('def')) obj.def = s.def;
    if (obj.metaspriteEditable) obj.metasprite = s.metasprite;
    if (obj.editable('speed')) obj.speed = s.speed;
    if (obj.editable('collisionPlane')) obj.collisionPlane = s.collisionPlane;
    if (obj.editable('level')) obj.level = s.level;
    if (obj.editable('poison')) obj.poison = s.poison;
    if (obj.editable('child')) obj.child = s.child;
    if (obj.editable('terrainSusceptibility')) {
      obj.terrainSusceptibility = s.terrainSusceptibility;
    }
    if (obj.editable('immobile')) obj.immobile = s.immobile;
    if (obj.editable('replacement')) obj.replacement = s.replacement;
    if (obj.editable('goldDrop')) obj.goldDrop = s.goldDrop;
    if (obj.editable('elements')) obj.elements = s.elements;
    if (obj.editable('expReward')) obj.expReward = s.expReward;
    if (obj.editable('attackType')) obj.attackType = s.attackType;
    if (obj.editable('statusEffect')) obj.statusEffect = s.statusEffect;
  });
}

function snapshotNpcs(npcs: Rom['npcs']): NpcsSnapshot {
  return Array.from({length: 256}, (_, id) => npcs.get(id)?.metaspriteBase ?? 0);
}

function restoreNpcs(npcs: Rom['npcs'], snap: NpcsSnapshot) {
  snap.forEach((metaspriteBase, id) => {
    const npc = npcs.get(id);
    if (npc) npc.metaspriteBase = metaspriteBase;
  });
}

function snapshotItemIcons(itemIcons: Rom['itemIcons']): ItemIconsSnapshot {
  return Array.from({length: NUM_ITEMS}, (_, id) => itemIcons.get(id));
}

function snapshotItemStats(itemStats: Rom['itemStats']): ItemStatsSnapshot {
  const ids = Array.from({length: NUM_ITEMS}, (_, id) => id);
  return {
    palette: ids.map(id => itemStats.palette(id)),
    unique: ids.map(id => itemStats.unique(id)),
    worn: ids.map(id => itemStats.worn(id)),
    solid: ids.map(id => itemStats.solid(id)),
    shieldDefense: [...itemStats.shieldDefense],
    armorDefense: [...itemStats.armorDefense],
  };
}

function restoreItemStats(itemStats: Rom['itemStats'], snap: ItemStatsSnapshot) {
  for (let id = 0; id < NUM_ITEMS; id++) {
    itemStats.setPalette(id, snap.palette[id]);
    itemStats.setUnique(id, snap.unique[id]);
    itemStats.setWorn(id, snap.worn[id]);
    itemStats.setSolid(id, snap.solid[id]);
  }
  itemStats.shieldDefense.splice(0, itemStats.shieldDefense.length, ...snap.shieldDefense);
  itemStats.armorDefense.splice(0, itemStats.armorDefense.length, ...snap.armorDefense);
}

function restoreItemIcons(itemIcons: Rom['itemIcons'], snap: ItemIconsSnapshot) {
  snap.forEach((value, id) => itemIcons.set(id, value));
}

function snapshotItemNames(itemNames: Rom['itemNames']): ItemNamesSnapshot {
  return Array.from({length: NUM_ITEMS}, (_, id) => itemNames.get(id));
}

function restoreItemNames(itemNames: Rom['itemNames'], snap: ItemNamesSnapshot) {
  snap.forEach((value, id) => itemNames.set(id, value));
}

function cloneDialogEntries(entries: DialogEntry[]): DialogEntry[] {
  return entries.map(e => ({
    condition: e.condition,
    message: {...e.message},
    flags: [...e.flags],
    updateAction: e.updateAction,
  }));
}

function snapshotNpcDialog(npc: Npc): NpcDialogSnapshot {
  return {
    global: cloneDialogEntries(npc.globalDialogs),
    local: [...npc.localDialogs.entries()].map(([loc, entries]) => [loc, cloneDialogEntries(entries)]),
  };
}

function restoreNpcDialog(npc: Npc | null, snap: NpcDialogSnapshot) {
  if (!npc) return;
  npc.globalDialogs.splice(0, npc.globalDialogs.length, ...cloneDialogEntries(snap.global));
  for (const [loc, entries] of snap.local) {
    const target = npc.localDialogs.get(loc);
    if (target) target.splice(0, target.length, ...cloneDialogEntries(entries));
  }
}

function snapshotNpcVisibility(npc: Npc): NpcVisibilitySnapshot {
  return [...npc.visibility].map(([location, conditions]) =>
    [location, [...conditions]]);
}

function restoreNpcVisibility(npc: Npc | null, snap: NpcVisibilitySnapshot) {
  if (!npc) return;
  npc.visibility.clear();
  for (const [location, conditions] of snap) {
    npc.visibility.set(location, [...conditions]);
  }
}

function snapshotTrigger(t: Trigger): TriggerSnapshot {
  return {conditions: [...t.conditions], message: {...t.message}, flags: [...t.flags]};
}

function restoreTrigger(t: Trigger | null, snap: TriggerSnapshot) {
  if (!t) return;
  t.conditions.splice(0, t.conditions.length, ...snap.conditions);
  t.message.part = snap.message.part;
  t.message.index = snap.message.index;
  t.flags.splice(0, t.flags.length, ...snap.flags);
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
