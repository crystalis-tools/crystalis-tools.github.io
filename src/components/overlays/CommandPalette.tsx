import {Command} from 'cmdk';
import {hex} from '../../rom/bytes';
import {exportBps, pickBps, pickRom} from '../../lib/files';
import {allItemIds, itemLabel} from '../../labels/itemlabels';
import {allShopTabs, shopTabLabel, shopTabResolved} from '../../labels/shoplabels';
import {useStore} from '../../state/store';
import {showAboutDialog} from '../layout/Titlebar';
import {HexBadge} from '../primitives/HexBadge';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Ctrl+P fuzzy palette: jump to a map, or run a menu action. Search sources
 *  (shops, items, etc.) grow in lockstep with the views that own that data. */
export function CommandPalette({open, onOpenChange}: CommandPaletteProps) {
  const rom = useStore(s => s.rom);
  const locations = rom?.usedLocations ?? [];
  const shops = rom ? allShopTabs() : [];
  const items = rom ? allItemIds() : [];
  const noop = () => {};

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <Command.Dialog
        open={open}
        onOpenChange={onOpenChange}
        label="Command palette"
        overlayClassName="fixed inset-0 z-40 bg-black/60"
        contentClassName={[
          'fixed left-1/2 top-[15vh] z-50 w-[560px] max-w-[90vw] -translate-x-1/2',
          'overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-2xl',
        ].join(' ')}>
      <Command.Input
          autoFocus
          placeholder="Search maps, shops, items, commands…"
          className="w-full border-b border-neutral-700 bg-transparent px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500" />
      <Command.List className="max-h-96 overflow-y-auto p-1">
        <Command.Empty className="px-3 py-2 text-sm text-neutral-500">No matches</Command.Empty>

        {locations.length > 0 && (
          <Command.Group heading="Maps" className="px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-500">
            {locations.map(loc => (
              <Command.Item
                  key={loc.id}
                  value={`${loc.name} 0x${hex(loc.id)}`}
                  onSelect={() => run(() => useStore.getState().openLocation(loc.id))}
                  className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
                <span>{loc.name}</span>
                <HexBadge value={loc.id} />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {rom && shops.length > 0 && (
          <Command.Group heading="Shops" className="px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-500">
            {shops.map(tab => {
              const label = shopTabLabel(rom, tab);
              const key = tab.shopType === 'pawn' ? 'pawn' : `${tab.shopType}:${tab.town}`;
              return (
                <Command.Item
                    key={key}
                    value={`shop ${label}`}
                    onSelect={() => run(() => useStore.getState().openShop(tab))}
                    className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
                  <span className={shopTabResolved(rom, tab) ? undefined : 'text-neutral-500'}>{label}</span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}

        {rom && items.length > 0 && (
          <Command.Group heading="Items" className="px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-500">
            {items.map(id => (
              <Command.Item
                  key={id}
                  value={`item ${itemLabel(rom, id)} 0x${hex(id)}`}
                  onSelect={() => run(() => useStore.getState().openItem(id))}
                  className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
                <span>{itemLabel(rom, id)}</span>
                <HexBadge value={id} />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Commands" className="px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-500">
          <Command.Item
              value="Open ROM"
              onSelect={() => run(() => pickRom(noop))}
              className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
            Open ROM…
          </Command.Item>
          <Command.Item
              value="Apply BPS patch"
              onSelect={() => run(() => pickBps(noop))}
              className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
            Apply BPS patch…
          </Command.Item>
          <Command.Item
              value="Save BPS patch export"
              onSelect={() => run(exportBps)}
              className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
            Save BPS…
          </Command.Item>
          <Command.Item
              value="Undo"
              onSelect={() => run(() => useStore.getState().undo())}
              className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
            Undo
          </Command.Item>
          <Command.Item
              value="Redo"
              onSelect={() => run(() => useStore.getState().redo())}
              className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
            Redo
          </Command.Item>
          <Command.Item
              value="About Crystalis Tools"
              onSelect={() => run(showAboutDialog)}
              className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 data-[selected=true]:bg-blue-600/30">
            About
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
