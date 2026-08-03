import {applyBpsPatch, createBpsPatch, readBpsMetadata} from '../rom/bps';
import {hex} from '../rom/bytes';
import {VANILLA_PRG_CRC} from '../rom/constants';
import {Rom} from '../rom/rom';
import {ProjectSettings} from '../rom/projectsettings';
import {Graphics} from '../render/graphics';
import {useStore} from '../state/store';
import {showDialog} from '../components/primitives/Dialog';
import {downloadFile} from './downloadFile';
import {clearCachedRom, loadCachedRom, saveCachedRom} from './romCache';

/** After a fresh vanilla-ROM load, offer to resume via BPS or start clean. */
function promptResumeOrNew(onLoaded: () => void) {
  showDialog(
      'ROM loaded',
      'Resume a saved project by applying its BPS patch, or start fresh from vanilla.',
      'info',
      [
        {label: 'Load existing project…', primary: true, run: () => pickBps(onLoaded)},
        {label: 'Start new project', run: () => {}},
      ],
      false);
}

/** Prompt for a ROM file and load it into the store. */
export function pickRom(onLoaded: () => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.nes,.bin,application/octet-stream';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) await loadRomFile(file, onLoaded);
  });
  input.click();
}

/** Prompt for a BPS patch and apply it on top of the loaded vanilla ROM. */
export function pickBps(onLoaded: () => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bps,application/octet-stream';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) await loadBpsFile(file, onLoaded);
  });
  input.click();
}

export async function loadRomFile(file: File, onLoaded: () => void) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    loadRomBytes(bytes, file.name, onLoaded);
    void saveCachedRom(bytes, file.name);
  } catch (e) {
    showDialog('Could not load ROM', String(e instanceof Error ? e.message : e), 'error');
  }
}

function loadRomBytes(bytes: Uint8Array, fileName: string, onLoaded: () => void) {
  const rom = Rom.load(bytes, fileName);
  if (rom.info.crc !== VANILLA_PRG_CRC) {
    throw new Error(
        `${fileName} isn't the vanilla Crystalis (USA) ROM (PRG CRC ` +
        `${hex(rom.info.crc, 8)}, expected ${hex(VANILLA_PRG_CRC, 8)}).\n\n` +
        `The editor only loads the original ROM. To bring in saved work, ` +
        `load the vanilla ROM here, then use File ▸ Apply BPS patch… ` +
        `to layer your changes on top.`);
  }
  useStore.getState().loadRom(rom, new Graphics(rom), null, `loaded ${fileName}`);
  onLoaded();
  promptResumeOrNew(onLoaded);
}

/** Try to resume from the ROM cached in IndexedDB from a previous session. */
export async function tryLoadCachedRom(onLoaded: () => void): Promise<boolean> {
  const cached = await loadCachedRom();
  if (!cached) return false;
  try {
    loadRomBytes(cached.bytes, cached.fileName, onLoaded);
    return true;
  } catch {
    void clearCachedRom();
    return false;
  }
}

export {clearCachedRom};

export async function loadBpsFile(file: File, onLoaded: () => void) {
  const rom = useStore.getState().rom;
  if (!rom) {
    showDialog('No ROM loaded', 'Load the vanilla ROM first, then apply a BPS patch.', 'error');
    return;
  }
  try {
    const patchBytes = new Uint8Array(await file.arrayBuffer());
    const target = applyBpsPatch(rom.original, patchBytes);
    const patched = Rom.load(target, rom.info.fileName, rom.original);
    const settings = ProjectSettings.fromBpsMetadata(readBpsMetadata(patchBytes));
    patched.projectSettings.name = settings.name;
    patched.projectSettings.version = settings.version;
    patched.projectSettings.engineTweaks = settings.engineTweaks;
    patched.projectSettings.buildDate = settings.buildDate;
    patched.projectSettings.toolCommitHash = settings.toolCommitHash;
    patched.projectSettings.toolCommitDate = settings.toolCommitDate;
    useStore.getState().loadRom(patched, new Graphics(patched), file.name, `applied ${file.name}`);
    onLoaded();
  } catch (e) {
    showDialog('Could not apply BPS patch', String(e instanceof Error ? e.message : e), 'error');
  }
}

function baseName(): string {
  const {patchFileName, rom} = useStore.getState();
  const name = patchFileName ?? rom?.info.fileName ?? 'crystalis';
  return name.replace(/\.[^.]+$/, '');
}

/** Build the edited ROM, reporting any warnings the writer produced. */
function buildOrWarn() {
  const rom = useStore.getState().rom;
  if (!rom) {
    showDialog('No ROM loaded', '', 'error');
    return null;
  }
  const result = rom.build();
  if (result.warnings.length) {
    showDialog('Build failed — no file was written', result.warnings.join('\n'), 'error');
  }
  return result;
}

declare global {
  interface Window {
    showSaveFilePicker?(options?: {
      suggestedName?: string;
      types?: {description?: string; accept: Record<string, string[]>}[];
    }): Promise<FileSystemFileHandle>;
  }
}

// Reused across saves so Ctrl+S overwrites the same file instead of the
// browser downloading a new "(1)"-suffixed copy each time.
let saveHandle: FileSystemFileHandle | null = null;
let saveHandleName: string | null = null;

export async function exportBps() {
  const rom = useStore.getState().rom;
  const result = buildOrWarn();
  if (!rom || !result?.ok) return;
  const patch = createBpsPatch(
      rom.original, result.rom,
      rom.projectSettings.toBpsMetadata(new Date().toISOString()));
  const name = `${baseName()}.bps`;

  if (window.showSaveFilePicker) {
    try {
      if (!saveHandle || saveHandleName !== name) {
        saveHandle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{description: 'BPS patch', accept: {'application/octet-stream': ['.bps']}}],
        });
        saveHandleName = name;
      }
      const writable = await saveHandle.createWritable();
      await writable.write(patch as BufferSource);
      await writable.close();
      markSaved(rom, `Saved ${saveHandle.name} - ${patch.length} bytes`);
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      saveHandle = null;
      saveHandleName = null;
    }
  }

  downloadFile(name, patch);
  markSaved(rom, `Saved ${name} - ${patch.length} bytes`);
}

/** Clears every dirty flag on `rom` and bumps `revision` so tab dots and
 *  other rom-derived UI (which read mutable fields, not store state) notice
 *  the save actually happened. */
function markSaved(rom: Rom, status: string) {
  rom.markClean();
  useStore.setState(state => ({revision: state.revision + 1, status}));
}

/** Dump the writer's allocation log, useful when debugging relocation. */
export function showBuildLog() {
  const result = buildOrWarn();
  if (!result) return;
  const lines = [...result.log, ...result.warnings.map(w => `WARNING: ${w}`)];
  showDialog('Build log', lines.length ? lines.join('\n') : 'No locations modified.',
             result.warnings.length ? 'error' : 'info');
}
