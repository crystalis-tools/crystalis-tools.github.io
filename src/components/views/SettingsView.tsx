import {useStore} from '../../state/store';
import {Field, numericClass, panelClass, scrollClass, ViewHeading} from './ViewParts';

export function SettingsView() {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  void revision;

  if (!rom) return null;
  const project = rom.projectSettings;

  return (
    <div className={panelClass}>
      <ViewHeading>Project Settings</ViewHeading>
      <div className={scrollClass}>
        <div className="mx-7 mb-12 max-w-md">
          <Field label="Name">
            <input
                type="text"
                maxLength={80}
                defaultValue={project.name}
                aria-label="Project name"
                onBlur={e => useStore.getState().setProjectSettings(e.target.value, project.version)}
                className={numericClass} />
          </Field>
          <Field label="Version">
            <input
                type="text"
                maxLength={32}
                defaultValue={project.version}
                aria-label="Project version"
                onBlur={e => useStore.getState().setProjectSettings(project.name, e.target.value)}
                className={numericClass} />
          </Field>
          <Field label="Build Date">
            <input
                type="text"
                readOnly
                value={project.buildDate ? new Date(project.buildDate).toLocaleString() : ''}
                aria-label="Build Date"
                className={numericClass} />
          </Field>
        </div>
        <div className="mx-7 mb-12 max-w-md">
          <h3 className="mb-2 text-sm font-semibold text-neutral-200">Engine Tweaks</h3>
          <p className="mb-3 text-xs text-neutral-500">
            Toggles for hardcoded engine behaviour that isn't part of any other
            editable table. Unchecking restores the exact vanilla bytes.
          </p>
          <div className="flex flex-col gap-3">
            {rom.engineTweaks.map(tweak => (
              <label key={tweak.id} className="flex items-start gap-2 text-sm text-neutral-300">
                <input
                    type="checkbox"
                    checked={tweak.enabled}
                    onChange={e => useStore.getState().setEngineTweak(tweak.id, e.target.checked)}
                    className="mt-0.5" />
                <span>
                  <span className="font-medium text-neutral-200">{tweak.name}</span>
                  <span className="block text-xs text-neutral-500">{tweak.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
