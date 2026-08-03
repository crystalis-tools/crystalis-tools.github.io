import * as RadixTooltip from '@radix-ui/react-tooltip';
import type {ReactElement, ReactNode} from 'react';

export function TooltipProvider({children}: {children: ReactNode}) {
  return <RadixTooltip.Provider delayDuration={400}>{children}</RadixTooltip.Provider>;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
}

/** Hover tooltip, e.g. for toolbar icon buttons and status-bar readouts. */
export function Tooltip({content, children}: TooltipProps) {
  if (!content) return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
            sideOffset={4}
            className="z-50 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100 shadow-lg">
          {content}
          <RadixTooltip.Arrow className="fill-neutral-800" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
