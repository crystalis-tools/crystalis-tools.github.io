import * as RadixDialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type {ReactNode} from 'react';
import {create} from 'zustand';

export interface DialogAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

interface DialogState {
  open: boolean;
  title: string;
  message: ReactNode;
  kind: 'info' | 'error';
  actions: DialogAction[];
  dismissable: boolean;
}

const useDialogStore = create<DialogState>(() => ({
  open: false, title: '', message: '', kind: 'info', actions: [], dismissable: true,
}));

/** Show a modal info/error dialog from anywhere - not just from inside a
 *  component, since ROM load/save flows raise these from plain async
 *  functions. Mirrors the old `dialog.ts`'s `showDialog()`.
 *  Pass `dismissable: false` to force the user to pick one of `actions`
 *  (no ×, no overlay click, no Escape). */
export function showDialog(
    title: string, message: ReactNode, kind: DialogState['kind'] = 'info',
    actions: DialogAction[] = [{label: 'OK', primary: true, run: () => {}}],
    dismissable = true) {
  useDialogStore.setState({open: true, title, message, kind, actions, dismissable});
}

function closeDialog() {
  useDialogStore.setState({open: false});
}

/** Mount once near the root of the app. */
export function DialogHost() {
  const {open, title, message, kind, actions, dismissable} = useDialogStore();
  return (
    <RadixDialog.Root open={open} onOpenChange={o => { if (!o && dismissable) closeDialog(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <RadixDialog.Content
            onPointerDownOutside={e => { if (!dismissable) e.preventDefault(); }}
            onEscapeKeyDown={e => { if (!dismissable) e.preventDefault(); }}
            className={clsx(
                'fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2',
                'rounded-md border border-neutral-700 bg-neutral-900 p-4 text-neutral-100 shadow-xl')}>
          <div className="flex items-start justify-between gap-2">
            <RadixDialog.Title
                className={clsx('text-sm font-semibold', kind === 'error' && 'text-red-400')}>
              {title}
            </RadixDialog.Title>
            {dismissable && (
              <RadixDialog.Close
                  className="-mr-1 -mt-1 rounded px-1.5 text-neutral-400 hover:text-neutral-100">
                ×
              </RadixDialog.Close>
            )}
          </div>
          {message ? (
            <RadixDialog.Description
                className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap font-mono text-xs text-neutral-300">
              {message}
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="mt-4 flex justify-end gap-2">
            {actions.map((action, i) => (
              <button
                  key={i}
                  autoFocus={action.primary}
                  onClick={() => { closeDialog(); action.run(); }}
                  className={clsx(
                      'rounded px-3 py-1 text-sm',
                      action.primary ?
                          'bg-blue-600 hover:bg-blue-500' :
                          'bg-neutral-700 hover:bg-neutral-600')}>
                {action.label}
              </button>
            ))}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
