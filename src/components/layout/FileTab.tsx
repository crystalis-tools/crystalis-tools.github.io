import type {IDockviewPanelHeaderProps} from 'dockview';
import {hex} from '../../rom/bytes';
import {npcLabel} from '../../labels/npclabels';
import {shopTabLabel} from '../../labels/shoplabels';
import {triggerHex} from '../../labels/triggerlabels';
import {tabKey, useStore, type WorkspaceTab} from '../../state/store';

const TAB_ICONS: Record<WorkspaceTab['kind'], string> = {
  location: '🗺️',
  shop: '🛒',
  settings: '⚙️',
  npc: '🧑',
  trigger: '⚡',
  items: '🗡️',
  enemies: '👹',
  flags: '🚩',
  messages: '💬',
};

export function tabDetails(tab: WorkspaceTab) {
  const rom = useStore.getState().rom;
  const icon = TAB_ICONS[tab.kind];
  if (!rom) return {label: '', dirty: false, icon};
  if (tab.kind === 'location') {
    const loc = rom.location(tab.id);
    return {label: loc.name || hex(tab.id), dirty: loc.dirty, icon};
  }
  if (tab.kind === 'shop') {
    return {label: shopTabLabel(rom, tab), dirty: rom.shopsDirty, icon};
  }
  if (tab.kind === 'settings') {
    return {label: 'Project Settings', dirty: rom.projectDirty, icon};
  }
  if (tab.kind === 'npc') {
    return {label: npcLabel(rom, tab.id), dirty: rom.npcsDirty, icon};
  }
  if (tab.kind === 'trigger') {
    return {label: triggerHex(tab.id), dirty: rom.triggersDirty, icon};
  }
  const labels: Record<Exclude<WorkspaceTab['kind'], 'location' | 'shop' | 'settings' | 'npc' | 'trigger'>, string> = {
    items: 'All Items',
    enemies: 'All Enemies',
    flags: 'All Event Flags',
    messages: 'All Messages',
  };
  return {label: labels[tab.kind], dirty: false, icon};
}

/** Header renderer for an open file's dockview tab. Each open location, shop,
 *  or table editor is its own dockview panel (draggable/repositionable);
 *  this renders that panel's tab label, dirty dot, and close button. */
export function FileTab({api}: IDockviewPanelHeaderProps) {
  const revision = useStore(s => s.revision);
  const tab = useStore(s => s.tabs.find(t => tabKey(t) === api.id));
  void revision;
  if (!tab) return null;
  const {label, dirty, icon} = tabDetails(tab);

  return (
    <div className="flex h-full items-center gap-2.5 px-4 text-sm">
      <span aria-hidden="true" className="opacity-70">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
      {dirty && <span aria-label="Modified" className="text-amber-400">●</span>}
      <button
          type="button"
          aria-label={`Close ${label}`}
          onClick={event => {
            event.stopPropagation();
            useStore.getState().closeTab(api.id);
          }}
          className="rounded px-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-100">
        ×
      </button>
    </div>
  );
}
