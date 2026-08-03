import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import {Command} from 'cmdk';
import {useState} from 'react';
import type {ReactNode} from 'react';

export interface ComboboxOption<T> {
  value: T;
  label: string;
  /** Custom row content (e.g. a thumbnail + label) - falls back to `label`. */
  render?: ReactNode;
}

export interface ComboboxProps<T> {
  value: T;
  options: Array<ComboboxOption<T>>;
  onChange: (value: T) => void;
  /** Stable string identity for a value; defaults to `String(value)`. */
  getKey?: (value: T) => string;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}

/**
 * A generic searchable id-picker: Radix Popover for positioning/focus-trap/
 * outside-click, cmdk's Command for the filterable list. Replaces the old
 * hand-rolled `customSelect()`/`hexSelect()` - used everywhere an id needs
 * picking, including with per-option canvas thumbnails via `render`.
 */
export function Combobox<T>({
  value, options, onChange, getKey = String, placeholder = 'Search…',
  className, triggerClassName, ariaLabel,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => getKey(o.value) === getKey(value));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
            type="button"
            aria-label={ariaLabel}
            className={clsx(
                'flex w-full items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800',
                'px-2 py-1 text-left text-sm hover:border-neutral-500', triggerClassName)}>
          {selected?.render ?? <span className="truncate">{selected?.label ?? '—'}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
            align="start"
            sideOffset={4}
            className={clsx(
                'z-50 min-w-[var(--radix-popover-trigger-width)] max-w-[360px] overflow-hidden',
                'rounded-md border border-neutral-700 bg-neutral-900 shadow-xl', className)}>
          <Command loop>
            <Command.Input
                autoFocus
                placeholder={placeholder}
                className={clsx(
                    'w-full border-b border-neutral-700 bg-transparent px-2 py-1.5 text-sm',
                    'outline-none placeholder:text-neutral-500')} />
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-1.5 text-sm text-neutral-500">No matches</Command.Empty>
              {options.map(opt => (
                <Command.Item
                    key={getKey(opt.value)}
                    value={`${getKey(opt.value)} ${opt.label}`}
                    onSelect={() => { onChange(opt.value); setOpen(false); }}
                    className={clsx(
                        'flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm',
                        'data-[selected=true]:bg-blue-600/30',
                        getKey(opt.value) === getKey(value) && 'text-blue-300')}>
                  {opt.render ?? <span className="truncate">{opt.label}</span>}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
