import clsx from 'clsx';
import {useState} from 'react';
import {CanvasThumb} from './CanvasThumb';
import {IconPickerModal, type IconPickerChoice} from './IconPickerModal';

export interface SpriteDropdownProps<T> {
  value: T;
  choices: Array<IconPickerChoice<T>>;
  draw: (ctx: CanvasRenderingContext2D, choice: T) => void;
  title: string;
  triggerTitle?: string;
  getKey?: (value: T) => string;
  cellSize?: number;
  disabled?: boolean;
  onChange: (value: T) => void;
}

/** A combobox-styled trigger that shows the current sprite inline (there's
 *  no text label for a sprite id) and opens a grid-of-thumbnails modal to
 *  pick a new one - the sprite equivalent of `Combobox`. */
export function SpriteDropdown<T>({
  value, choices, draw, title, triggerTitle, getKey = String, cellSize = 32,
  disabled, onChange,
}: SpriteDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} title={triggerTitle}
          onClick={() => setOpen(true)}
          className={clsx(
              'flex w-[220px] items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800',
              'px-2 py-1 text-left text-sm hover:border-neutral-500',
              'disabled:cursor-not-allowed disabled:opacity-50')}>
        <CanvasThumb width={cellSize} height={cellSize} draw={ctx => draw(ctx, value)} />
      </button>
      <IconPickerModal
          open={open}
          title={title}
          choices={choices}
          selected={value}
          cellSize={cellSize}
          draw={draw}
          getKey={getKey}
          onOpenChange={setOpen}
          onPick={onChange} />
    </>
  );
}
