import type {DockviewApi, DockviewReadyEvent, GetTabContextMenuItemsParams} from 'dockview';
import {DockviewReact} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useHotkeys} from 'react-hotkeys-hook';
import {exportBps, loadBpsFile, loadRomFile} from '../../lib/files';
import {selectActiveTab, tabKey, useStore} from '../../state/store';
import {CommandPalette} from '../overlays/CommandPalette';
import {Welcome} from '../overlays/Welcome';
import {Inspector} from '../panels/Inspector';
import {DialogHost} from '../primitives/Dialog';
import {TooltipProvider} from '../primitives/Tooltip';
import {Explorer} from './Explorer';
import {FilePane} from './FilePane';
import {FileTab} from './FileTab';
import {Statusbar} from './Statusbar';
import {Titlebar} from './Titlebar';

/** Ids of panels that aren't open files - never touched by the tab sync. */
const PINNED_PANEL_IDS = new Set(['explorer', 'inspector']);

const panelComponents = {
  explorer: Explorer,
  file: FilePane,
  inspector: Inspector,
};

const tabComponents = {file: FileTab};

function getTabContextMenuItems({panel, group}: GetTabContextMenuItemsParams) {
  if (!useStore.getState().tabs.some(t => tabKey(t) === panel.id)) return [];
  const store = useStore.getState();
  const siblings = group.panels;
  const index = siblings.indexOf(panel);
  return [
    {label: 'Close', action: () => store.closeTab(panel.id)},
    {
      label: 'Close Others', disabled: siblings.length <= 1,
      action: () => store.closeOtherTabs(panel.id),
    },
    {
      label: 'Close to the Right', disabled: index >= siblings.length - 1,
      action: () => store.closeTabsToRight(panel.id),
    },
    'separator' as const,
    {label: 'Close All', action: () => store.closeAllTabs()},
  ];
}

export function App() {
  const apiRef = useRef<DockviewApi | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tabs = useStore(s => s.tabs);
  const activeTabKey = useStore(s => s.activeTabKey);
  const rom = useStore(s => s.rom);

  useHotkeys('mod+p', () => setPaletteOpen(true), {preventDefault: true});
  useHotkeys('mod+s', () => exportBps(), {preventDefault: true});
  useHotkeys('mod+z', () => useStore.getState().undo(), {preventDefault: true});
  useHotkeys('mod+shift+z', () => useStore.getState().redo(), {preventDefault: true});
  useHotkeys('escape', () => useStore.setState({selection: {kind: null, index: -1}}), {
    enabled: !paletteOpen,
  });

  // Back/forward navigation history over active tabs, driven by the mouse's
  // side buttons (button 3 = back, button 4 = forward), like a browser.
  const navHistoryRef = useRef<string[]>([]);
  const navFutureRef = useRef<string[]>([]);
  const navigatingRef = useRef(false);
  useEffect(() => {
    if (navigatingRef.current) {
      navigatingRef.current = false;
      return;
    }
    if (!activeTabKey) return;
    const history = navHistoryRef.current;
    if (history[history.length - 1] === activeTabKey) return;
    history.push(activeTabKey);
    navFutureRef.current = [];
  }, [activeTabKey]);
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      const history = navHistoryRef.current;
      const future = navFutureRef.current;
      if (e.button === 3) {
        if (history.length < 2) return;
        future.push(history.pop()!);
        navigatingRef.current = true;
        useStore.setState({activeTabKey: history[history.length - 1]});
      } else {
        const next = future.pop();
        if (next === undefined) return;
        history.push(next);
        navigatingRef.current = true;
        useStore.setState({activeTabKey: next});
      }
    }
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);
  useEffect(() => {
    const openKeys = new Set(tabs.map(tabKey));
    navHistoryRef.current = navHistoryRef.current.filter(k => openKeys.has(k));
    navFutureRef.current = navFutureRef.current.filter(k => openKeys.has(k));
  }, [tabs]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    const explorer = api.addPanel({
      id: 'explorer', component: 'explorer', renderer: 'always',
      initialWidth: 260,
    });
    explorer.group.locked = true;
    explorer.group.header.hidden = true;
    explorer.group.api.setConstraints({maximumWidth: 400});

    const inspector = api.addPanel({
      id: 'inspector', component: 'inspector', renderer: 'always',
      initialWidth: 320,
      position: {referencePanel: explorer.id, direction: 'right'},
    });
    inspector.group.locked = true;
    inspector.group.header.hidden = true;
    inspector.group.api.setConstraints({maximumWidth: 420});
    inspector.group.api.setVisible(false);

    api.onDidActivePanelChange(activeEvent => {
      const id = activeEvent.panel?.id;
      const store = useStore.getState();
      if (id && store.tabs.some(t => tabKey(t) === id) && store.activeTabKey !== id) {
        useStore.setState({activeTabKey: id});
      }
    });
  }, []);

  // Keep one dockview panel per open file tab, adding/removing panels to
  // match the store's tab list. Position within the grid (splits, tab order)
  // is otherwise entirely up to the user, since dockview owns it.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    for (const tab of tabs) {
      const key = tabKey(tab);
      if (api.getPanel(key)) continue;
      const sibling = api.panels.find(p => !PINNED_PANEL_IDS.has(p.id));
      api.addPanel({
        id: key, component: 'file', tabComponent: 'file',
        position: sibling ?
            {referencePanel: sibling.id, direction: 'within'} :
            {referencePanel: 'explorer', direction: 'right'},
      });
    }
    const openKeys = new Set(tabs.map(tabKey));
    for (const panel of [...api.panels]) {
      if (!PINNED_PANEL_IDS.has(panel.id) && !openKeys.has(panel.id)) api.removePanel(panel);
    }
  }, [tabs]);

  // Mirror the store's active tab into dockview's active panel.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !activeTabKey) return;
    const panel = api.getPanel(activeTabKey);
    if (panel && api.activePanel?.id !== activeTabKey) panel.api.setActive();
  }, [activeTabKey, tabs]);

  // Inspector (Map/Tiles/Entities) is scoped to the map window: only visible
  // while the active tab is a location.
  const activeTabKind = useStore(s => selectActiveTab(s)?.kind ?? null);
  useEffect(() => {
    const api = apiRef.current;
    const group = api?.getPanel('inspector')?.group;
    if (!group) return;
    const visible = activeTabKind === 'location';
    group.api.setVisible(visible);
    if (visible) group.api.setSize({width: 320});
  }, [activeTabKind]);

  // Whole-window drag-and-drop for .bps/.nes files.
  useEffect(() => {
    const onLoaded = () => {};
    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    }
    function onDrop(e: DragEvent) {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      if (file.name.endsWith('.bps')) void loadBpsFile(file, onLoaded);
      else void loadRomFile(file, onLoaded);
    }
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!rom) {
    return (
      <TooltipProvider>
        <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
          <Welcome />
        </div>
        <DialogHost />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
        <Titlebar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="min-h-0 flex-1">
          <DockviewReact
              className="dockview-theme-abyss h-full w-full"
              components={panelComponents}
              tabComponents={tabComponents}
              getTabContextMenuItems={getTabContextMenuItems}
              onReady={onReady} />
        </div>
        <Statusbar />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <DialogHost />
    </TooltipProvider>
  );
}
