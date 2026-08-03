import {SPAWN_TYPES} from '../../rom/constants';
import {findFlagReferences} from '../../labels/flagrefs';
import type {Location} from '../../rom/location';
import {SpawnType} from '../../rom/locationtables';
import type {Rom} from '../../rom/rom';
import {useStore, type Selection} from '../../state/store';
import {Combobox} from '../primitives/Combobox';
import {Switch} from '../primitives/Switch';
import {FlagIdPicker} from '../views/ScriptBlocks';
import {Field, HexSelect, idRange, NumberField} from '../views/ViewParts';
import {objectIdName} from './MapEntityHover';

function edit(label: string, mutate: () => void) {
  useStore.getState().edit(label, mutate);
}

export function SpawnDetail({rom, loc, index}: {rom: Rom, loc: Location, index: number}) {
  const spawn = loc.spawns[index];
  if (!spawn) return null;
  return (
    <>
      <Field label="Type">
        <Combobox value={spawn.type} ariaLabel="Spawn type"
            options={SPAWN_TYPES.map((label, value) => ({value, label: `${value} · ${label}`}))}
            onChange={value => edit('Set spawn type', () => { spawn.type = value; })} />
      </Field>
      <Field label="Object id">
        <HexSelect ids={idRange(256)} value={spawn.id} ariaLabel="Object id"
            labelFor={id => objectIdName(rom, spawn.type, id)}
            onChange={value => edit('Set spawn id', () => { spawn.id = value; })} />
      </Field>
      {!spawn.isMonster() && spawn.type !== SpawnType.NPC && spawn.xt === 0 && spawn.yt === 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tile X"><NumberField value={spawn.xt} max={0x7f} ariaLabel="Spawn tile X" onCommit={value => edit('Move spawn', () => { spawn.xt = value; })} /></Field>
          <Field label="Tile Y"><NumberField value={spawn.yt} max={0xff} ariaLabel="Spawn tile Y" onCommit={value => edit('Move spawn', () => { spawn.yt = value; })} /></Field>
        </div>
      )}
      <div className="mb-1 flex flex-col gap-3">
        <Switch label="Timed respawn" checked={spawn.timed} onCheckedChange={value => edit('Set timed', () => { spawn.timed = value; })} />
        <Switch label="Half-tile offset" checked={spawn.halfTile} onCheckedChange={value => edit('Set offset', () => { spawn.halfTile = value; })} />
        <Switch label="Pattern bank 1" checked={spawn.patternBank === 1} onCheckedChange={value => edit('Set pattern bank', () => { spawn.patternBank = value ? 1 : 0; })} />
        <Switch label="Active" checked={spawn.used} onCheckedChange={value => edit('Toggle spawn', () => { spawn.used = value; })} />
      </div>
    </>
  );
}

export function ExitDetail({rom, loc, index}: {rom: Rom, loc: Location, index: number}) {
  const exit = loc.exits[index];
  if (!exit) return null;
  return (
    <>
      <Field label="Destination"><HexSelect ids={rom.usedLocations.map(l => l.id)} value={exit.dest} ariaLabel="Exit destination" labelFor={id => rom.location(id).label} onChange={v => edit('Set exit destination', () => { exit.dest = v; })} /></Field>
      <Field label="Destination entrance" hint={exit.seamless ? 'Seamless (bit 0x20 set)' : undefined}>
        <NumberField value={exit.entrance} ariaLabel="Destination entrance" onCommit={v => edit('Set exit entrance', () => { exit.entrance = v; })} />
      </Field>
    </>
  );
}

export function FlagDetail({rom, loc, index}: {rom: Rom, loc: Location, index: number}) {
  const flag = loc.flags[index];
  if (!flag) return null;
  const store = useStore.getState();
  const refs = findFlagReferences(rom, flag.flag, {
    openTrigger: store.openTrigger, openNpc: store.openNpc, openLocation: store.openLocation,
  }, loc.id);
  return (
    <>
      <Field label="Event Flag id">
        <FlagIdPicker magnitude={flag.flag} ariaLabel="Event Flag id" onChange={v => edit('Set flag', () => { flag.flag = 0x200 | (v & 0xff); })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Screen X"><NumberField value={flag.screenX} max={7} ariaLabel="Event Flag screen X" onCommit={v => edit('Move flag', () => { flag.screenX = v; })} /></Field>
        <Field label="Screen Y"><NumberField value={flag.screenY} max={15} ariaLabel="Event Flag screen Y" onCommit={v => edit('Move flag', () => { flag.screenY = v; })} /></Field>
      </div>
      {refs.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xs font-semibold text-neutral-500">Referenced by</span>
          {refs.map((ref, i) => (
            <button key={i} type="button" onClick={ref.onClick}
                className="truncate rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-left text-xs text-neutral-200 hover:border-neutral-500">
              {ref.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function PitDetail({rom, loc, index}: {rom: Rom, loc: Location, index: number}) {
  const pit = loc.pits[index];
  if (!pit) return null;
  return (
    <>
      <Field label="Destination"><HexSelect ids={rom.usedLocations.map(l => l.id)} value={pit.dest} ariaLabel="Pit destination" labelFor={id => rom.location(id).label} onChange={v => edit('Set pit destination', () => { pit.dest = v; })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From screen X"><NumberField value={pit.fromXs} max={7} ariaLabel="Pit source X" onCommit={v => edit('Move pit', () => { pit.fromXs = v; })} /></Field>
        <Field label="From screen Y"><NumberField value={pit.fromYs} max={15} ariaLabel="Pit source Y" onCommit={v => edit('Move pit', () => { pit.fromYs = v; })} /></Field>
        <Field label="To screen X"><NumberField value={pit.toXs} max={7} ariaLabel="Pit target X" onCommit={v => edit('Set pit target', () => { pit.toXs = v; })} /></Field>
        <Field label="To screen Y"><NumberField value={pit.toYs} max={15} ariaLabel="Pit target Y" onCommit={v => edit('Set pit target', () => { pit.toYs = v; })} /></Field>
      </div>
    </>
  );
}

export function MapEntityInlineEditor({rom, loc, selection}: {rom: Rom, loc: Location, selection: Selection}) {
  if (selection.kind === 'spawn') return <SpawnDetail rom={rom} loc={loc} index={selection.index} />;
  if (selection.kind === 'exit') return <ExitDetail rom={rom} loc={loc} index={selection.index} />;
  if (selection.kind === 'flag') return <FlagDetail rom={rom} loc={loc} index={selection.index} />;
  if (selection.kind === 'pit') return <PitDetail rom={rom} loc={loc} index={selection.index} />;
  return null;
}

export function cloneSelectedEntity(loc: Location, selection: Selection) {
  const {kind, index} = selection;
  if (kind === 'spawn') {
    const spawn = loc.spawns[index];
    if (!spawn) return;
    edit('Clone spawn', () => {
      const copy = spawn.clone();
      copy.xt = (copy.xt + 1) & 0x7f;
      loc.spawns.push(copy);
      useStore.setState({selection: {kind: 'spawn', index: loc.spawns.length - 1}});
    });
  } else if (kind === 'exit') {
    const exit = loc.exits[index];
    if (!exit) return;
    edit('Clone exit', () => {
      loc.exits.push(exit.clone());
      useStore.setState({selection: {kind: 'exit', index: loc.exits.length - 1}});
    });
  } else if (kind === 'flag') {
    const flag = loc.flags[index];
    if (!flag) return;
    edit('Clone flag', () => {
      loc.flags.push(flag.clone());
      useStore.setState({selection: {kind: 'flag', index: loc.flags.length - 1}});
    });
  } else if (kind === 'pit') {
    const pit = loc.pits[index];
    if (!pit) return;
    edit('Clone pit', () => {
      loc.pits.push(pit.clone());
      useStore.setState({selection: {kind: 'pit', index: loc.pits.length - 1}});
    });
  }
}

export function deleteSelectedEntity(loc: Location, selection: Selection) {
  const {kind, index} = selection;
  if (kind === 'spawn') edit('Delete spawn', () => { loc.spawns.splice(index, 1); });
  else if (kind === 'exit') edit('Delete exit', () => { loc.exits.splice(index, 1); });
  else if (kind === 'entrance') edit('Delete entrance', () => { loc.entrances.splice(index, 1); });
  else if (kind === 'flag') edit('Delete flag', () => { loc.flags.splice(index, 1); });
  else if (kind === 'pit') edit('Delete pit', () => { loc.pits.splice(index, 1); });
  useStore.setState({selection: {kind: null, index: -1}});
}
