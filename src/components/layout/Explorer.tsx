import clsx from 'clsx';
import {useEffect, useRef, useState} from 'react';
import type {NodeApi, NodeRendererProps} from 'react-arborist';
import {Tree} from 'react-arborist';
import {useShallow} from 'zustand/react/shallow';
import {hex} from '../../rom/bytes';
import {enemyLabel, usedMonsterIds} from '../../labels/enemylabels';
import {allNamedFlagIds, flagLabel} from '../../labels/flaglabels';
import {allItemIds, itemLabel} from '../../labels/itemlabels';
import {allMessages, messageHex, messageKey, messagePreview, type MessageEntry}
    from '../../labels/messagelabels';
import {allNpcs, npcLabel} from '../../labels/npclabels';
import {allShopTabs, shopTabIndex, shopTabLabel, shopTabResolved, shopTownName}
    from '../../labels/shoplabels';
import {triggerHex, usedTriggers} from '../../labels/triggerlabels';
import type {Npc} from '../../rom/objects';
import {SidebarHex} from '../primitives/SidebarHex';
import type {Rom} from '../../rom/rom';
import type {Trigger} from '../../rom/trigger';
import {selectActiveTab, tabKey, useStore, type ShopTab} from '../../state/store';

type LeafData =
  | {type: 'map', id: string, name: string, hex: string, dirty: boolean, locationId: number}
  | {type: 'shop', id: string, name: string, hex: string | null, resolved: boolean, tab: ShopTab}
  | {type: 'item', id: string, name: string, hex: string, itemId: number}
  | {type: 'enemy', id: string, name: string, hex: string, enemyId: number}
  | {type: 'npc', id: string, name: string, hex: string, npcId: number}
  | {type: 'flag', id: string, name: string, hex: string, flagId: number}
  | {type: 'trigger', id: string, name: string, hex: string, triggerId: number}
  | {type: 'message', id: string, name: string, hex: string, part: number, index: number}
  | {type: 'settings', id: string, name: string};

interface GroupData {
  type: 'group';
  id: string;
  name: string;
  children: ExplorerNode[];
}

type ExplorerNode = GroupData | LeafData;

const LEAF_ICONS: Record<LeafData['type'], string> = {
  map: '🗺️',
  shop: '🛒',
  item: '🗡️',
  enemy: '👹',
  npc: '🧑',
  flag: '🚩',
  trigger: '⚡',
  message: '💬',
  settings: '⚙️',
};

/** Bucket items into subfolders by key, preserving first-seen key order. */
function groupBy<T>(
    parentId: string, items: T[], keyOf: (item: T) => string,
    toLeaf: (item: T) => LeafData): ExplorerNode[] {
  const groups = new Map<string, LeafData[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    const leaf = toLeaf(item);
    if (bucket) bucket.push(leaf);
    else groups.set(key, [leaf]);
  }
  return [...groups.entries()].map(([name, children]) =>
    children.length === 1 ? children[0] : {
      type: 'group', id: `${parentId}:${name}`, name, children,
    });
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({width: 0, height: 0});
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({width: entry.contentRect.width, height: entry.contentRect.height});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function buildTree(rom: Rom | null): ExplorerNode[] {
  if (!rom) return [];

  const maps: ExplorerNode[] = groupBy(
      'group:maps',
      rom.usedLocations.slice().sort((a, b) => a.id - b.id),
      loc => loc.group,
      loc => ({
        type: 'map', id: `map:${loc.id}`, name: loc.label, hex: hex(loc.id),
        dirty: loc.dirty, locationId: loc.id,
      }));

  const shops: ExplorerNode[] = groupBy(
      'group:shops',
      allShopTabs(),
      tab => tab.shopType === 'pawn' ? 'General' : shopTownName(rom, tab.town),
      tab => {
        const index = shopTabIndex(rom, tab);
        return {
          type: 'shop', id: `shop:${tabKey({kind: 'shop', ...tab})}`,
          name: shopTabLabel(rom, tab), hex: index === null ? null : hex(index),
          resolved: shopTabResolved(rom, tab), tab,
        };
      });

  const items: LeafData[] = allItemIds().map(id => ({
    type: 'item', id: `item:${id}`, name: itemLabel(rom, id), hex: hex(id), itemId: id,
  }));

  const enemies: LeafData[] = usedMonsterIds(rom).map(id => ({
    type: 'enemy', id: `enemy:${id}`, name: enemyLabel(rom, id), hex: hex(id), enemyId: id,
  }));

  const npcs: LeafData[] = allNpcs(rom).map((npc: Npc) => ({
    type: 'npc', id: `npc:${npc.id}`, name: npcLabel(rom, npc.id), hex: hex(npc.id), npcId: npc.id,
  }));

  const flags: LeafData[] = allNamedFlagIds().map(id => ({
    type: 'flag', id: `flag:${id}`, name: flagLabel(id), hex: hex(id, 3), flagId: id,
  }));

  const triggers: LeafData[] = usedTriggers(rom).map((t: Trigger) => ({
    type: 'trigger', id: `trigger:${t.id}`, name: triggerHex(t.id), hex: hex(t.id), triggerId: t.id,
  }));

  const messages: LeafData[] = allMessages(rom).map((m: MessageEntry) => ({
    type: 'message', id: `message:${messageKey(m.part, m.index)}`,
    name: messagePreview(m.text), hex: messageHex(m.part, m.index),
    part: m.part, index: m.index,
  }));

  return [
    {type: 'settings', id: 'settings', name: 'Project Settings'},
    {type: 'group', id: 'group:maps', name: 'Maps', children: maps},
    {type: 'group', id: 'group:shops', name: 'Shops', children: shops},
    {type: 'group', id: 'group:items', name: 'Items', children: items},
    {type: 'group', id: 'group:enemies', name: 'Enemies', children: enemies},
    {type: 'group', id: 'group:npcs', name: 'NPCs', children: npcs},
    {type: 'group', id: 'group:flags', name: 'Event Flags', children: flags},
    {type: 'group', id: 'group:triggers', name: 'Triggers', children: triggers},
    {type: 'group', id: 'group:messages', name: 'Messages', children: messages},
  ];
}

function searchMatch(node: NodeApi<ExplorerNode>, term: string): boolean {
  const q = term.toLowerCase();
  const hexQuery = q.replace(/^(0x|\$)/, '');
  const d = node.data;
  switch (d.type) {
    case 'group': return false;
    case 'map': return d.name.toLowerCase().includes(q) || d.hex.includes(hexQuery);
    case 'shop': return d.name.toLowerCase().includes(q);
    case 'item': case 'enemy': case 'npc': case 'flag':
      return d.name.toLowerCase().includes(q) || d.hex.includes(hexQuery);
    case 'trigger': return d.name.toLowerCase().includes(q);
    case 'message': return d.name.toLowerCase().includes(q) || d.hex.includes(hexQuery);
    case 'settings': return d.name.toLowerCase().includes(q);
  }
}

function isActive(activeTab: ReturnType<typeof selectActiveTab>, focus: {
  itemId: number | null, enemyId: number | null,
  flagId: number | null, messageId: string | null,
}, d: LeafData): boolean {
  if (d.type === 'map') return activeTab?.kind === 'location' && activeTab.id === d.locationId;
  if (d.type === 'shop') return activeTab?.kind === 'shop' && tabKey(activeTab) === tabKey({kind: 'shop', ...d.tab});
  if (d.type === 'item') return activeTab?.kind === 'items' && focus.itemId === d.itemId;
  if (d.type === 'enemy') return activeTab?.kind === 'enemies' && focus.enemyId === d.enemyId;
  if (d.type === 'npc') return activeTab?.kind === 'npc' && activeTab.id === d.npcId;
  if (d.type === 'flag') return activeTab?.kind === 'flags' && focus.flagId === d.flagId;
  if (d.type === 'trigger') return activeTab?.kind === 'trigger' && activeTab.id === d.triggerId;
  if (d.type === 'settings') return activeTab?.kind === 'settings';
  return activeTab?.kind === 'messages' && focus.messageId === messageKey(d.part, d.index);
}

function openLeaf(d: LeafData) {
  const s = useStore.getState();
  if (d.type === 'map') s.openLocation(d.locationId);
  else if (d.type === 'shop') s.openShop(d.tab);
  else if (d.type === 'item') s.openItem(d.itemId);
  else if (d.type === 'enemy') s.openEnemy(d.enemyId);
  else if (d.type === 'npc') s.openNpc(d.npcId);
  else if (d.type === 'flag') s.openFlag(d.flagId);
  else if (d.type === 'trigger') s.openTrigger(d.triggerId);
  else if (d.type === 'settings') s.openSettings();
  else s.openMessage(d.part, d.index);
}

function Row({node, style}: NodeRendererProps<ExplorerNode>) {
  const activeTab = useStore(selectActiveTab);
  const projectDirty = useStore(s => s.rom?.projectDirty ?? false);
  const focus = useStore(useShallow(s => ({
    itemId: s.focusItemId, enemyId: s.focusEnemyId,
    flagId: s.focusFlagId, messageId: s.focusMessageId,
  })));
  const d = node.data;
  const indentStyle = {...style, paddingLeft: (node.level + 1) * 14};

  if (d.type === 'group') {
    return (
      <button
          type="button"
          style={indentStyle}
          onClick={() => node.toggle()}
          className="flex w-full items-center gap-1.5 px-2 text-sm text-neutral-300 hover:bg-neutral-800">
        <span className="w-3 text-neutral-500">{node.isOpen ? '▾' : '▸'}</span>
        <span className="shrink-0">{node.isOpen ? '📂' : '📁'}</span>
        <span className="flex-1 truncate text-left font-medium">{d.name}</span>
      </button>
    );
  }

  const active = isActive(activeTab, focus, d);
  return (
    <button
        type="button"
        style={indentStyle}
        title={d.type === 'message' ? d.name :
            `${d.name}${'hex' in d && d.hex ? ` - 0x${d.hex}` : ''}`}
        onClick={() => openLeaf(d)}
        className={clsx(
            'flex w-full items-center gap-1.5 px-2 text-sm hover:bg-neutral-800',
            active ? 'bg-blue-600/30 text-blue-200' : 'text-neutral-300',
            d.type === 'shop' && !d.resolved && 'text-neutral-600')}>
      <span className="w-3 shrink-0" />
      <span className="shrink-0">{LEAF_ICONS[d.type]}</span>
      <span className="min-w-0 flex-1 truncate text-left">{d.name}</span>
      {d.type === 'map' && d.dirty && <span className="text-amber-400">●</span>}
      {d.type === 'settings' && projectDirty && <span className="text-amber-400">●</span>}
      {'hex' in d && d.hex && (
        d.type === 'message'
          ? <SidebarHex text={d.hex} raw className="shrink-0" />
          : <SidebarHex text={d.hex} className="shrink-0" />
      )}
    </button>
  );
}

export function Explorer() {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  const [filter, setFilter] = useState('');
  const [containerRef, size] = useElementSize<HTMLDivElement>();

  const data = buildTree(rom);
  void revision; // rebuild the tree whenever the ROM mutates (dirty dots, etc).

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 p-2">
        <input
            type="search"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-neutral-500" />
      </div>
      <div ref={containerRef} className="min-h-0 flex-1">
        {rom && size.height > 0 && (
          <Tree<ExplorerNode>
              data={data}
              width={size.width}
              height={size.height}
              rowHeight={24}
              indent={0}
              openByDefault={false}
              disableEdit
              disableDrag
              disableDrop
              searchTerm={filter}
              searchMatch={searchMatch}>
            {Row}
          </Tree>
        )}
      </div>
    </div>
  );
}
