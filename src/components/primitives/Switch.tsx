import * as RadixSwitch from '@radix-ui/react-switch';
import clsx from 'clsx';
import type {ReactNode} from 'react';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

/** A labelled on/off switch, replacing `toggle()` from the old hand-rolled
 *  `dom.ts`. */
export function Switch({
  checked, onCheckedChange, label, className, disabled, title, ariaLabel,
}: SwitchProps) {
  return (
    <label
        title={title}
        className={clsx(
            'inline-flex items-center gap-2 text-sm',
            disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer', className)}>
      <RadixSwitch.Root
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={ariaLabel}
          className={clsx(
              'relative h-5 w-9 shrink-0 rounded-full bg-neutral-700 outline-none',
              'transition-colors data-[state=checked]:bg-blue-600 disabled:cursor-not-allowed')}>
        <RadixSwitch.Thumb
            className={clsx(
                'block size-4 translate-x-0.5 rounded-full bg-white',
                'transition-transform duration-100 data-[state=checked]:translate-x-[18px]')} />
      </RadixSwitch.Root>
      {label != null && <span>{label}</span>}
    </label>
  );
}
