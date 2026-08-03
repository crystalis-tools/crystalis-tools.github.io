import * as RadixDialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import {CanvasThumb} from './CanvasThumb';

export interface IconPickerChoice<T> {
  value: T;
  label?: string;
}

export interface IconPickerModalProps<T> {
  open: boolean;
  title: string;
  choices: Array<IconPickerChoice<T>>;
  selected?: T;
  cellSize?: number;
  draw: (ctx: CanvasRenderingContext2D, choice: T) => void;
  getKey?: (value: T) => string;
  onPick: (value: T) => void;
  onOpenChange: (open: boolean) => void;
}

/** A grid-of-thumbnails picker modal - used for item icons, NPC and enemy
 *  metasprites, anywhere a sprite is chosen instead of typed. */
export function IconPickerModal<T>({
  open, title, choices, selected, cellSize = 32, draw, getKey = String,
  onPick, onOpenChange,
}: IconPickerModalProps<T>) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <RadixDialog.Content
            className={clsx(
                'fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[480px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2',
                'overflow-auto rounded-md border border-neutral-700 bg-neutral-900 p-4 shadow-xl')}>
          <RadixDialog.Title className="text-sm font-semibold text-neutral-100">{title}</RadixDialog.Title>
          <div className="mt-3 grid grid-cols-8 gap-1">
            {choices.map(choice => (
              <button
                  key={getKey(choice.value)}
                  type="button"
                  title={choice.label}
                  onClick={() => { onPick(choice.value); onOpenChange(false); }}
                  className={clsx(
                      'flex items-center justify-center rounded border p-0.5 hover:border-blue-400',
                      selected != null && getKey(selected) === getKey(choice.value) ?
                          'border-blue-500 bg-blue-500/20' : 'border-neutral-700')}>
                <CanvasThumb width={cellSize} height={cellSize} draw={ctx => draw(ctx, choice.value)} />
              </button>
            ))}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
