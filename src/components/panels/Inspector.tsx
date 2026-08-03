import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import {itemLabel} from '../../labels/itemlabels';
import {hex} from '../../rom/bytes';
import {MAX_LAYOUT_HEIGHT, MAX_LAYOUT_WIDTH} from '../../rom/constants';
import type {Location} from '../../rom/location';
import {Entrance, Exit, Flag, Pit, Spawn} from '../../rom/locationtables';
import type {Rom} from '../../rom/rom';
import {ENTRANCE_COLOR, EXIT_COLOR, FLAG_COLOR, PIT_COLOR, renderContext} from '../../render/maprenderer';
import {cssColor} from '../../render/nespalette';
import {
  selectActiveLocation, useStore, type InspectorTab, type SelectionKind,
} from '../../state/store';
import {CanvasThumb} from '../primitives/CanvasThumb';
import {HexBadge} from '../primitives/HexBadge';
import {Switch} from '../primitives/Switch';
import {
  ActionButton, Field, HexSelect, IconButton, idRange, NumberField, useFocusScroll,
} from '../views/ViewParts';

const sectionClass = 'mb-3 mt-6 border-b border-neutral-800 pb-2 text-sm font-semibold text-neutral-200';

function SectionHeader({title, onAdd}: {title: string, onAdd: () => void}) {
  return (
    <div className={clsx(sectionClass, 'flex items-center justify-between gap-2')}>
      <span>{title}</span>
      <IconButton label="Add" onClick={onAdd} />
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function edit(label: string, mutate: () => void) {
  useStore.getState().edit(label, mutate);
}

function PaletteField({rom, loc, index}: {rom: Rom, loc: Location, index: number}) {
  const paletteId = loc.tilePalettes[index];
  return (
    <Field label={`Pal ${index}`}>
      <NumberField value={paletteId} ariaLabel={`Palette ${index}`}
          onCommit={value => edit('Set palette', () => {
            loc.tilePalettes[index] = value & 0xff;
            useStore.getState().graphics?.invalidate();
          })} />
      <div className="mt-1.5 flex overflow-hidden rounded border border-neutral-800">
        {[0, 1, 2, 3].map(color => {
          const value = rom.palettes.get(paletteId).color(color);
          return <span key={color} title={`0x${hex(value)}`} className="h-4 flex-1" style={{background: cssColor(value)}} />;
        })}
      </div>
    </Field>
  );
}

function MapTab({rom, loc}: {rom: Rom, loc: Location}) {
  return (
    <>
      <div className="mb-5 flex items-baseline justify-between gap-2">
        <h2 className="truncate text-base font-semibold text-neutral-100">{loc.label}</h2>
        <HexBadge value={loc.id} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Width" hint="Screens across">
          <NumberField value={loc.width} min={1} max={MAX_LAYOUT_WIDTH} ariaLabel="Map width"
              onCommit={value => edit('Resize map', () => loc.resize(clamp(value, 1, MAX_LAYOUT_WIDTH), loc.height))} />
        </Field>
        <Field label="Height" hint="Screens down">
          <NumberField value={loc.height} min={1} max={MAX_LAYOUT_HEIGHT} ariaLabel="Map height"
              onCommit={value => edit('Resize map', () => loc.resize(loc.width, clamp(value, 1, MAX_LAYOUT_HEIGHT)))} />
        </Field>
      </div>
      <Field label="Background music">
        <HexSelect ids={idRange(256)} value={loc.bgm} ariaLabel="Background music"
            onChange={value => edit('Set music', () => { loc.bgm = value; })} />
      </Field>
      <div className={sectionClass}>Graphics</div>
      <Field label="Tileset">
        <HexSelect ids={rom.tilesets.ids()} value={loc.tileset} ariaLabel="Tileset"
            onChange={value => edit('Set tileset', () => {
              loc.tileset = value;
              loc.tileEffects = rom.tilesets.get(value).effectsId();
              useStore.getState().graphics?.invalidate();
            })} />
      </Field>
      <Field label="Tile effects">
        <HexSelect ids={rom.tilesets.effectsIds()} value={loc.tileEffects} ariaLabel="Tile effects"
            onChange={value => edit('Set tile effects', () => { loc.tileEffects = value; })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(index => (
          <Field key={index} label={`Pattern ${index}`}>
            <NumberField value={loc.tilePatterns[index]} ariaLabel={`Tile pattern ${index}`}
                onCommit={value => edit('Set pattern', () => {
                  loc.tilePatterns[index] = value & 0xff;
                  useStore.getState().graphics?.invalidate();
                })} />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(index => <PaletteField key={index} rom={rom} loc={loc} index={index} />)}
      </div>
      <Field label="Animation">
        <NumberField value={loc.animation} ariaLabel="Animation" onCommit={value => edit('Set animation', () => { loc.animation = value & 0xff; })} />
      </Field>
      <Switch label="Extended screen plane" checked={loc.plane !== 0}
          onCheckedChange={value => edit('Set plane', () => {
            loc.plane = value ? 0x100 : 0;
            loc.screens = loc.screens.map(row => row.map(screen => (screen & 0xff) | loc.plane));
            useStore.getState().graphics?.invalidateScreens();
          })} />
      <div className={sectionClass}>Save behaviour</div>
      <div className="flex flex-col gap-3">
        <Switch label="Checkpoint" checked={loc.checkpoint} onCheckedChange={value => edit('Set checkpoint', () => { loc.checkpoint = value; })} />
        <Switch label="Saveable" checked={loc.saveable} onCheckedChange={value => edit('Set saveable', () => { loc.saveable = value; })} />
      </div>
    </>
  );
}

function TilesTab({loc}: {loc: Location}) {
  const selected = useStore(s => s.selectedMetatile);
  const revision = useStore(s => s.revision);
  const gridRef = useFocusScroll<HTMLDivElement>('data-tile-id', selected, 'nearest');
  const context = renderContext(loc);
  void revision;

  return (
    <div ref={gridRef} className="grid h-full grid-cols-8 content-start gap-1 overflow-y-auto p-2">
      {idRange(256).map(id => (
        <button key={id} type="button" title={`0x${hex(id)}`} data-tile-id={id}
            onClick={() => useStore.setState({selectedMetatile: id, tool: 'paint'})}
            className={clsx(
                'aspect-square rounded border p-0.5 hover:border-blue-400',
                id === selected ? 'border-blue-500 bg-blue-500/20' : 'border-neutral-800')}>
          <CanvasThumb width={16} height={16} className="h-full w-full [image-rendering:pixelated]"
              draw={ctx => ctx.drawImage(useStore.getState().graphics!.metatile(context, id), 0, 0)} />
        </button>
      ))}
    </div>
  );
}

function spawnDisplayName(rom: Rom, spawn: Spawn): string {
  if (spawn.isMonster()) {
    const object = rom.objects.get(spawn.monsterId);
    if (object?.name) return object.name;
  } else if (spawn.type === 1) {
    const npc = rom.npcs.get(spawn.id);
    if (npc?.name) return npc.name;
  } else if (spawn.isChest() && spawn.id < 0x50) {
    return itemLabel(rom, spawn.id);
  }
  return `0x${hex(spawn.id)}`;
}

function EntityButton({selected, badge, badgeColor, label, tail, onClick, onDelete}: {
  selected: boolean, badge: string, badgeColor?: string, label: string, tail?: string,
  onClick: () => void, onDelete?: () => void,
}) {
  return (
    <div className={clsx(
        'flex w-full items-center gap-2 border-b border-neutral-800 pl-3 pr-1 py-2 text-xs last:border-b-0',
        selected ? 'bg-blue-500/15 text-blue-200' : 'text-neutral-300 hover:bg-neutral-800/70')}>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-neutral-950"
            style={{backgroundColor: badgeColor ?? '#404040', color: badgeColor ? '#0a0a0a' : '#a3a3a3'}}>
          {badge}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {tail && <span className="shrink-0 font-mono text-[10px] text-neutral-600">{tail}</span>}
      </button>
      {onDelete && (
        <button type="button" title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}
            className="shrink-0 rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-red-400">
          ×
        </button>
      )}
    </div>
  );
}

type EntityKind = 'exits' | 'entrances' | 'flags' | 'pits';

const ENTITY_BADGE_COLOR: Partial<Record<EntityKind, string>> = {
  entrances: ENTRANCE_COLOR,
  exits: EXIT_COLOR,
  flags: FLAG_COLOR,
  pits: PIT_COLOR,
};

function EntityList({loc, kind, title}: {
  loc: Location, kind: EntityKind, title: string,
}) {
  const selection = useStore(s => s.selection);
  const singular = kind.slice(0, -1) as Exclude<SelectionKind, 'spawn' | null>;
  const items = loc[kind];
  const selected = selection.kind === singular ? selection.index : -1;

  function add() {
    edit(`Add ${singular}`, () => {
      if (kind === 'exits') loc.exits.push(Exit.create());
      else if (kind === 'entrances') loc.entrances.push(Entrance.create());
      else if (kind === 'flags') loc.flags.push(Flag.create());
      else loc.pits.push(Pit.create());
    });
    useStore.setState({selection: {kind: singular, index: items.length - 1}});
  }

  function remove(index: number) {
    edit(`Delete ${singular}`, () => {
      if (kind === 'exits') loc.exits.splice(index, 1);
      else if (kind === 'entrances') loc.entrances.splice(index, 1);
      else if (kind === 'flags') loc.flags.splice(index, 1);
      else loc.pits.splice(index, 1);
    });
    if (selection.kind === singular && selection.index === index) {
      useStore.setState({selection: {kind: null, index: -1}});
    }
  }

  return (
    <>
      <SectionHeader title={`${title} (${items.length})`} onAdd={add} />
      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-neutral-800">
          {items.map((item, index) => (
            <EntityButton key={index} selected={index === selected} badge={hex(index)}
                badgeColor={ENTITY_BADGE_COLOR[kind]} label={item.toString()}
                onClick={() => useStore.setState({
                  selection: index === selected ? {kind: null, index: -1} : {kind: singular, index},
                })}
                onDelete={kind === 'exits' || kind === 'entrances' ? () => remove(index) : undefined} />
          ))}
        </div>
      )}
      {selected >= 0 && kind !== 'exits' && kind !== 'entrances' && (
        <div className="mt-2">
          <ActionButton onClick={() => remove(selected)}>Delete</ActionButton>
        </div>
      )}
    </>
  );
}

function SpawnsTab({rom, loc}: {rom: Rom, loc: Location}) {
  const selection = useStore(s => s.selection);
  const selected = selection.kind === 'spawn' ? selection.index : -1;
  return (
    <>
      <h2 className="mb-4 text-base font-semibold">Entities</h2>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(index => (
          <Field key={`pal-${index}`} label={`Sprite pal ${index}`}>
            <NumberField value={loc.spritePalettes[index]} ariaLabel={`Sprite palette ${index}`}
                onCommit={value => edit('Set sprite palette', () => { loc.spritePalettes[index] = value & 0xff; })} />
          </Field>
        ))}
        {[0, 1].map(index => (
          <Field key={`pat-${index}`} label={`Sprite pat ${index}`}>
            <NumberField value={loc.spritePatterns[index]} ariaLabel={`Sprite pattern ${index}`}
                onCommit={value => edit('Set sprite pattern', () => { loc.spritePatterns[index] = value & 0xff; })} />
          </Field>
        ))}
      </div>
      <SectionHeader title={`Entities (${loc.spawns.length})`} onAdd={() => {
        edit('Add spawn', () => {
          const spawn = Spawn.create();
          spawn.xt = 0x08;
          spawn.yt = 0x08;
          loc.spawns.push(spawn);
        });
        useStore.setState({selection: {kind: 'spawn', index: loc.spawns.length - 1}});
      }} />
      {loc.spawns.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-neutral-800">
          {loc.spawns.map((spawn, index) => (
            <EntityButton key={index} selected={index === selected} badge={spawn.kind()}
                label={spawnDisplayName(rom, spawn)}
                tail={!spawn.used ? 'off' : undefined}
                onClick={() => useStore.setState({selection: {kind: 'spawn', index}})}
                onDelete={() => {
                  edit('Delete spawn', () => { loc.spawns.splice(index, 1); });
                  if (selection.kind === 'spawn' && selection.index === index) {
                    useStore.setState({selection: {kind: null, index: -1}});
                  }
                }} />
          ))}
        </div>
      )}
      <EntityList loc={loc} kind="entrances" title="Entrances" />
      <EntityList loc={loc} kind="exits" title="Exits" />
      <EntityList loc={loc} kind="flags" title="Event Flag screens" />
      <EntityList loc={loc} kind="pits" title="Pits" />
    </>
  );
}

export function Inspector() {
  const rom = useStore(s => s.rom);
  const loc = useStore(selectActiveLocation);
  const activeTab = useStore(s => s.inspectorTab);
  const revision = useStore(s => s.revision);
  void revision;
  const tabs: Array<[InspectorTab, string]> = [['map', 'Map'], ['tiles', 'Tiles'], ['spawns', 'Entities']];
  return (
    <Tabs.Root value={activeTab} onValueChange={value => useStore.setState({inspectorTab: value as InspectorTab})}
        className="flex h-full min-h-0 flex-col text-sm text-neutral-300">
      <Tabs.List className="grid shrink-0 grid-cols-3 border-b border-neutral-800">
        {tabs.map(([id, label]) => (
          <Tabs.Trigger key={id} value={id}
              className="border-b-2 border-transparent px-2 py-2.5 text-xs font-medium text-neutral-500 hover:text-neutral-300 data-[state=active]:border-blue-500 data-[state=active]:text-neutral-100">
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <div className={clsx('min-h-0 flex-1', activeTab === 'tiles' ? 'overflow-hidden' : 'overflow-y-auto p-4')}>
        {!rom || !loc ? (
          <><div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Inspector</div><p className="text-neutral-500">Open a map to edit it.</p></>
        ) : activeTab === 'map' ? <MapTab rom={rom} loc={loc} /> :
          activeTab === 'tiles' ? <TilesTab loc={loc} /> : <SpawnsTab rom={rom} loc={loc} />}
      </div>
    </Tabs.Root>
  );
}
