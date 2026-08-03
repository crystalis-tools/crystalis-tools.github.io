import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import type {ReactNode} from 'react';
import {clearAllMaps, clearAllMessages, clearAllShops} from '../../lib/bulkclear';
import {exportBps, pickBps, pickRom, showBuildLog} from '../../lib/files';
import {useStore} from '../../state/store';
import {DISCORD_URL, DiscordIcon, GITHUB_URL, GitHubIcon} from '../overlays/SocialLinks';
import {showDialog} from '../primitives/Dialog';

function AboutContent() {
  return (
    <div className="font-sans">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/favicon.svg" alt="Crystalis Tools" className="h-12 w-12" />
        <div className="text-base font-semibold text-neutral-100">Crystalis Tools</div>
        <div className="text-xs text-neutral-400">A browser-based ROM editor for Crystalis (NES)</div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-neutral-300">
        Explore and edit maps, NPCs, items, shops, flags and triggers directly
        against the ROM, then export a BPS patch — useful for randomizers,
        translations, bugfix hacks and general ROM-hacking experimentation.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 hover:border-neutral-600 hover:bg-neutral-700">
          <span className="text-lg">💻</span>
          <span className="flex flex-col">
            <span className="text-xs font-semibold text-neutral-100">Source &amp; issues</span>
            <span className="text-[11px] text-neutral-400">GitHub repository</span>
          </span>
        </a>
        <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 hover:border-neutral-600 hover:bg-neutral-700">
          <span className="text-lg">💬</span>
          <span className="flex flex-col">
            <span className="text-xs font-semibold text-neutral-100">Discord</span>
            <span className="text-[11px] text-neutral-400">Join the community server</span>
          </span>
        </a>
      </div>
      {(__COMMIT_HASH__ || __COMMIT_DATE__) && (
        <div className="mt-4 border-t border-neutral-800 pt-3 text-center text-[11px] text-neutral-500">
          <div className="uppercase tracking-wide text-neutral-600">Build</div>
          <div className="mt-0.5">
            {__COMMIT_HASH__ && (
              <a
                  href={`${GITHUB_URL}/commit/${__COMMIT_HASH__}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-neutral-400 hover:text-neutral-200 hover:underline">
                {__COMMIT_HASH__}
              </a>
            )}
            {__COMMIT_HASH__ && __COMMIT_DATE__ && <span className="mx-1">·</span>}
            {__COMMIT_DATE__}
          </div>
        </div>
      )}
    </div>
  );
}

export function showAboutDialog() {
  showDialog('About', <AboutContent />, 'info', []);
}

function DialogMacrosContent() {
  return (
    <div className="font-sans">
      <p className="text-xs leading-relaxed text-neutral-300">
        NPC dialogue text supports a few macros besides plain ASCII and
        newlines.
      </p>
      <dl className="mt-3 flex flex-col gap-2 text-xs">
        <div>
          <dt className="font-mono font-semibold text-neutral-100">{'{NAME}'}</dt>
          <dd className="text-neutral-400">Inserts the hero's name.</dd>
        </div>
        <div>
          <dt className="font-mono font-semibold text-neutral-100">{'{ITEM}'}</dt>
          <dd className="text-neutral-400">
            Placeholder for "whatever item this NPC/trigger just gave you."
            It's filled in automatically from that script's item-give action
            — you don't set it in the text itself. For a chest's message,
            that's the chest's own item id; for an NPC, it's whatever item
            id that NPC's dialogue is set to hand over.
          </dd>
        </div>
        <div>
          <dt className="font-mono font-semibold text-neutral-100">{'{ITEM 0x00}'}</dt>
          <dd className="text-neutral-400">
            Inserts the item's name.
          </dd>
        </div>
        <div>
          <dt className="font-mono font-semibold text-neutral-100">{'{PAGE BREAK}'}</dt>
          <dd className="text-neutral-400">
            Starts a new page.
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function showDialogMacrosDialog() {
  showDialog('Dialog Macros', <DialogMacrosContent />, 'info', []);
}

export interface TitlebarProps {
  onOpenPalette: () => void;
}

export function Titlebar({onOpenPalette}: TitlebarProps) {
  const rom = useStore(s => s.rom);
  const canUndo = useStore(s => s.canUndo);
  const canRedo = useStore(s => s.canRedo);
  const undoLabel = useStore(s => s.undoLabel);
  const revision = useStore(s => s.revision);
  void revision; // re-render so `rom.dirty` picks up mutations outside the undo stack (project settings, engine tweaks).
  const redoLabel = useStore(s => s.redoLabel);
  const noop = () => {};

  return (
    <div className="flex h-[58px] shrink-0 items-center gap-[18px] border-b border-neutral-800 bg-neutral-900 px-5 text-neutral-300">
      <span className="mr-2 shrink-0 font-semibold text-neutral-100">Crystalis Tools</span>
      <TitlebarMenu label="File">
        <TitlebarItem onSelect={() => pickRom(noop)}>Open ROM…</TitlebarItem>
        <TitlebarItem disabled={!rom} onSelect={() => pickBps(noop)}>Apply BPS patch…</TitlebarItem>
        <DropdownMenu.Separator className="my-1 h-px bg-neutral-700" />
        <TitlebarItem disabled={!rom} onSelect={exportBps}>Save BPS…</TitlebarItem>
        <TitlebarItem disabled={!rom} onSelect={showBuildLog}>Show build log</TitlebarItem>
      </TitlebarMenu>
      <TitlebarMenu label="Edit">
        <TitlebarItem disabled={!canUndo} onSelect={() => useStore.getState().undo()}>
          Undo{undoLabel ? `: ${undoLabel}` : ''}
        </TitlebarItem>
        <TitlebarItem disabled={!canRedo} onSelect={() => useStore.getState().redo()}>
          Redo{redoLabel ? `: ${redoLabel}` : ''}
        </TitlebarItem>
      </TitlebarMenu>
      <TitlebarMenu label="Tools">
        <TitlebarItem disabled={!rom} onSelect={clearAllMaps}>Clear all maps…</TitlebarItem>
        <TitlebarItem disabled={!rom} onSelect={clearAllMessages}>Clear all messages…</TitlebarItem>
        <TitlebarItem disabled={!rom} onSelect={clearAllShops}>Clear all shops…</TitlebarItem>
      </TitlebarMenu>
      <TitlebarMenu label="Help">
        <TitlebarItem onSelect={showDialogMacrosDialog}>Dialog Macros</TitlebarItem>
        <TitlebarItem onSelect={showAboutDialog}>About</TitlebarItem>
      </TitlebarMenu>

      <div className="ml-3 flex flex-1 justify-center">
        <button
            type="button"
            onClick={onOpenPalette}
            className={clsx(
                'flex w-full max-w-[420px] items-center justify-between rounded-[10px] border border-neutral-800',
                'bg-app-input px-4 py-2 text-left text-neutral-600 hover:border-neutral-700')}>
          <span>Search maps, items, commands…</span>
          <kbd className="rounded-md border border-neutral-800 bg-neutral-800 px-2 py-px font-mono text-[15px] text-neutral-300">Ctrl+P</kbd>
        </button>
      </div>

      <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
          className="ml-3 flex shrink-0 items-center justify-center rounded-[10px] border border-neutral-800 p-2 text-neutral-400 hover:border-neutral-700 hover:text-neutral-100">
        <GitHubIcon className="h-5 w-5" />
      </a>

      <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Discord"
          className="flex shrink-0 items-center justify-center rounded-[10px] border border-neutral-800 p-2 text-neutral-400 hover:border-neutral-700 hover:text-neutral-100">
        <DiscordIcon className="h-5 w-5" />
      </a>

      <button
          type="button"
          disabled={!rom || !rom.dirty}
          onClick={exportBps}
          className={clsx(
              'ml-3 shrink-0 rounded-[10px] border px-5 py-2 font-semibold',
              rom?.dirty
                ? 'border-green-600 bg-green-600 text-white hover:bg-green-500'
                : 'border-neutral-700 bg-neutral-800 text-neutral-500 opacity-60')}>
        Save
      </button>
    </div>
  );
}

function TitlebarMenu({label, children}: {label: string, children: ReactNode}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="shrink-0 rounded-lg px-4 py-2 text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-100 data-[state=open]:bg-neutral-800 data-[state=open]:text-neutral-100">
        {label}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[340px] rounded-[10px] border border-neutral-700 bg-neutral-800 p-2 text-left shadow-[0_12px_34px_rgba(0,0,0,0.55)]">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function TitlebarItem(
    {children, onSelect, disabled}: {children: ReactNode, onSelect: () => void, disabled?: boolean}) {
  return (
    <DropdownMenu.Item
        disabled={disabled}
        onSelect={onSelect}
        className={clsx(
            'cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-200 outline-none',
            'data-[highlighted]:bg-blue-600/30',
            'data-[disabled]:cursor-default data-[disabled]:text-neutral-600')}>
      {children}
    </DropdownMenu.Item>
  );
}
