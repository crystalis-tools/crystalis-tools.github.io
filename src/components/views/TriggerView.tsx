import {useMemo} from 'react';
import {messagePickerOptions} from '../../labels/messagelabels';
import {triggerHex} from '../../labels/triggerlabels';
import {useStore} from '../../state/store';
import {HexBadge} from '../primitives/HexBadge';
import {MessageRefEditor, SignedIdListEditor} from './ScriptBlocks';
import {panelClass, scrollClass, TextAreaField, ViewHeading} from './ViewParts';

export function TriggerView({id}: {id: number}) {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  const messageOptions = useMemo(() => {
    void revision;
    return rom ? messagePickerOptions(rom) : [];
  }, [rom, revision]);

  if (!rom) return null;
  const trigger = rom.triggers.get(id);
  if (!trigger) return null;
  const label = triggerHex(id);
  const messageText = rom.messages.get(trigger.message.part, trigger.message.index) ?? '';
  const editTrigger = (title: string, mutate: () => void) => {
    const store = useStore.getState();
    store.edit(title, () => {
      store.touchTrigger(id);
      mutate();
    });
  };

  return (
    <div className={panelClass}>
      <ViewHeading>
        <span className="mr-2 align-middle"><HexBadge value={id} /></span>
        Trigger {label}
      </ViewHeading>
      <div className={scrollClass}>
        <div className="mx-7 mb-12 max-w-3xl">
          <SignedIdListEditor
              ids={trigger.conditions}
              title="Event Flag Conditions"
              hint="All of these must hold for the trigger to fire."
              mode="condition"
              min={1}
              onChange={conditions => editTrigger(`Edit conditions for trigger ${label}`, () => {
                trigger.conditions.splice(0, trigger.conditions.length, ...conditions);
              })} />
          <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
              <span className="text-sm font-semibold text-neutral-200">Message</span>
            </div>
            <div className="flex flex-col gap-2 px-4 py-3">
              <MessageRefEditor
                  value={trigger.message}
                  options={messageOptions}
                  onChange={message => editTrigger(`Edit message for trigger ${label}`, () => {
                    trigger.message.part = message.part;
                    trigger.message.index = message.index;
                  })} />
              <TextAreaField
                  value={messageText}
                  rows={Math.min(20, Math.max(1, messageText.split('\n').length))}
                  ariaLabel={`Trigger ${label} message`}
                  onCommit={text => {
                    const store = useStore.getState();
                    store.edit(`Edit message for trigger ${label}`, () => {
                      store.touchMessage(trigger.message.part, trigger.message.index);
                      rom.messages.set(trigger.message.part, trigger.message.index, text);
                    });
                  }} />
            </div>
          </div>
          <SignedIdListEditor
              ids={trigger.flags}
              title="Event Flag Effects"
              hint="Event Flags set to ON or OFF once the trigger fires."
              mode="condition"
              positiveWord="set to"
              min={1}
              onChange={flags => editTrigger(`Edit flags for trigger ${label}`, () => {
                trigger.flags.splice(0, trigger.flags.length, ...flags);
              })} />
        </div>
      </div>
    </div>
  );
}
