import clsx from 'clsx';
import {useState} from 'react';
import {allItemIds, itemLabel} from '../../labels/itemlabels';
import {drawItemIcon} from '../../render/icons';
import type {ItemStats} from '../../rom/itemdata';
import {useStore} from '../../state/store';
import {CanvasThumb} from '../primitives/CanvasThumb';
import {HexBadge} from '../primitives/HexBadge';
import {IconPickerModal} from '../primitives/IconPickerModal';
import {Switch} from '../primitives/Switch';
import {
  focusedClass, headerClass, NumberField, panelClass, rowClass, scrollClass,
  tableClass, TextField, useFocusScroll, ViewHeading,
} from './ViewParts';

function itemType(stats: ItemStats, id: number): string {
  if (stats.isShield(id)) return 'Shield';
  if (stats.isArmor(id)) return 'Armor';
  if (stats.worn(id)) return 'Weapon';
  return 'Item';
}

const gridClass =
    'grid grid-cols-[80px_minmax(150px,1fr)_58px_96px_112px_74px_74px_74px_74px] items-center gap-x-4';

export function ItemsView() {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  const focusId = useStore(s => s.focusItemId);
  const bodyRef = useFocusScroll<HTMLDivElement>('data-item-id', focusId);
  const [pickerItemId, setPickerItemId] = useState<number | null>(null);
  void revision;

  if (!rom) return null;
  const editStats = (label: string, mutate: () => void) => {
    const store = useStore.getState();
    store.edit(label, () => { store.touchItemStats(); mutate(); });
  };
  const pickerId = pickerItemId;
  const iconChoices = [...new Set(allItemIds().map(id => rom.itemIcons.get(id)))]
      .sort((a, b) => a - b);

  return (
    <div className={panelClass}>
      <ViewHeading>Items</ViewHeading>
      <div ref={bodyRef} className={scrollClass}>
        <div className={clsx(tableClass, 'mx-7 mb-12 min-w-[1180px] max-w-[1490px]')} role="table" aria-label="All items">
          <div className={clsx(headerClass, gridClass)} role="row">
            {['Id', 'Item', 'Sprite', 'Item Type', 'Sell Price', 'Def', 'Unique', 'Worn', 'Solid']
                .map(label => <span key={label} role="columnheader">{label}</span>)}
          </div>
          {allItemIds().map(id => {
            const stats = rom.itemStats;
            const label = itemLabel(rom, id);
            const defense = stats.defense(id);
            return (
              <div
                  key={id}
                  role="row"
                  data-item-id={id}
                  className={clsx(rowClass, gridClass, id === focusId && focusedClass)}>
                <div role="cell"><HexBadge value={id} /></div>
                <div role="cell">
                  <TextField value={rom.itemNames.get(id)}
                      maxLength={rom.itemNames.maxLength(id)}
                      disabled={rom.itemNames.maxLength(id) === 0}
                      title={rom.itemNames.maxLength(id) === 0 ?
                          'This item has no name string in the ROM to rename.' :
                          `Max ${rom.itemNames.maxLength(id)} characters`}
                      ariaLabel={`Name for ${label}`}
                      onCommit={value => {
                        const store = useStore.getState();
                        store.edit('Rename item', () => {
                          store.touchItemNames();
                          rom.itemNames.set(id, value);
                        });
                      }} />
                </div>
                <div role="cell">
                  <button
                      type="button"
                      title={`Change ${label}'s icon`}
                      onClick={() => setPickerItemId(id)}
                      className="size-11 rounded-md border border-neutral-700 bg-black p-0 hover:border-neutral-500">
                    <CanvasThumb width={24} height={24} className="h-full w-full [image-rendering:pixelated]" draw={ctx => drawItemIcon(ctx, rom, rom.itemIcons.get(id))} />
                  </button>
                </div>
                <div role="cell" className="text-sm text-neutral-400">{itemType(stats, id)}</div>
                <div role="cell">
                  <NumberField value={rom.shops.sellPrices[id]} min={0} max={0xffff}
                      ariaLabel={`Sell price for ${label}`}
                      onCommit={value => {
                        const store = useStore.getState();
                        store.edit('Edit sell price', () => {
                          store.touchShops();
                          rom.shops.sellPrices[id] = value;
                        });
                      }} />
                </div>
                <div role="cell">
                  <NumberField value={defense ?? 0} disabled={defense == null}
                      title={defense == null ? 'Only armor and shields have a defense value' : undefined}
                      ariaLabel={`Defense for ${label}`}
                      onCommit={value => editStats('Edit item defense', () => stats.setDefense(id, value))} />
                </div>
                {([
                  ['Unique', stats.unique(id), (v: boolean) => stats.setUnique(id, v)],
                  ['Worn', stats.worn(id), (v: boolean) => stats.setWorn(id, v)],
                  ['Solid', stats.solid(id), (v: boolean) => stats.setSolid(id, v)],
                ] as const).map(([name, checked, setValue]) => (
                  <div key={name} role="cell">
                    <Switch checked={checked} ariaLabel={`${name} for ${label}`}
                        onCheckedChange={value => editStats('Edit item flags', () => setValue(value))} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <IconPickerModal
          open={pickerId != null}
          title={pickerId == null ? 'Item icon' : `Icon for ${itemLabel(rom, pickerId)}`}
          choices={iconChoices.map(value => ({value}))}
          selected={pickerId == null ? undefined : rom.itemIcons.get(pickerId)}
          draw={(ctx, iconByte) => drawItemIcon(ctx, rom, iconByte)}
          onOpenChange={open => { if (!open) setPickerItemId(null); }}
          onPick={iconByte => {
            if (pickerId == null) return;
            const store = useStore.getState();
            store.edit('Set item icon', () => {
              store.touchItemIcons();
              rom.itemIcons.set(pickerId, iconByte);
            });
            setPickerItemId(null);
          }} />
    </div>
  );
}
