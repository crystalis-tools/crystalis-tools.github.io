import clsx from 'clsx';
import {allMessages, messageHex, messageKey} from '../../labels/messagelabels';
import {useStore} from '../../state/store';
import {HexBadge} from '../primitives/HexBadge';
import {
  focusedClass, headerClass, panelClass, rowClass, scrollClass, tableClass,
  TextAreaField, useFocusScroll, ViewHeading,
} from './ViewParts';

const gridClass = 'grid grid-cols-[80px_1fr] items-center gap-x-4';

export function MessagesView() {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  const focusKey = useStore(s => s.focusMessageId);
  const bodyRef = useFocusScroll<HTMLDivElement>('data-message-key', focusKey);
  void revision;

  if (!rom) return null;
  return (
    <div className={panelClass}>
      <ViewHeading>Messages</ViewHeading>
      <div ref={bodyRef} className={scrollClass}>
        <div className={clsx(tableClass, 'mx-7 mb-12 min-w-[600px] max-w-[1180px]')} role="table" aria-label="All messages">
          <div className={clsx(headerClass, gridClass)} role="row">
            {['Id', 'Text'].map(label => <span key={label} role="columnheader">{label}</span>)}
          </div>
          {allMessages(rom).map(message => {
            const key = messageKey(message.part, message.index);
            const label = messageHex(message.part, message.index);
            return (
              <div
                  key={key}
                  role="row"
                  data-message-key={key}
                  className={clsx(rowClass, gridClass, 'py-3', key === focusKey && focusedClass)}>
                <div role="cell"><HexBadge text={label} /></div>
                <div role="cell">
                  <TextAreaField
                      value={message.text}
                      rows={Math.min(8, Math.max(1, message.text.split('\n').length))}
                      ariaLabel={`Message ${label}`}
                      onCommit={text => {
                        const store = useStore.getState();
                        store.edit(`Edit message ${label}`, () => {
                          store.touchMessage(message.part, message.index);
                          rom.messages.set(message.part, message.index, text);
                        });
                      }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
