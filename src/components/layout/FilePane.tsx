import type {IDockviewPanelProps} from 'dockview';
import {selectTabByKey, useStore} from '../../state/store';
import {EnemiesView} from '../views/EnemiesView';
import {FlagsView} from '../views/FlagsView';
import {ItemsView} from '../views/ItemsView';
import {MessagesView} from '../views/MessagesView';
import {MapView} from '../views/MapView';
import {NpcView} from '../views/NpcView';
import {SettingsView} from '../views/SettingsView';
import {ShopView} from '../views/ShopView';
import {TriggerView} from '../views/TriggerView';

/** Content renderer shared by every open file's dockview panel: renders
 *  whichever editor matches THIS panel's own tab (looked up by dockview
 *  panel id, which is the tab's stable key). Splitting the layout can put
 *  several file panels on screen at once, so this must not depend on
 *  whichever tab is globally "active" - each panel shows its own tab. */
export function FilePane({api}: IDockviewPanelProps) {
  const tab = useStore(s => selectTabByKey(s, api.id));
  if (!tab) return null;
  switch (tab.kind) {
    case 'location': return <MapView tab={tab} panelApi={api} />;
    case 'shop': return <ShopView tab={tab} />;
    case 'items': return <ItemsView />;
    case 'enemies': return <EnemiesView />;
    case 'npc': return <NpcView id={tab.id} />;
    case 'flags': return <FlagsView />;
    case 'trigger': return <TriggerView id={tab.id} />;
    case 'messages': return <MessagesView />;
    case 'settings': return <SettingsView />;
    default: return null;
  }
}
