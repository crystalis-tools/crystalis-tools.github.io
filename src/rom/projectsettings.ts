const DEFAULT_NAME = 'Untitled Mod';
const DEFAULT_VERSION = '0.1';
const METADATA_TOOL = 'crystalis-tools';
const METADATA_FORMAT = 1;

interface ProjectMetadata {
  tool: string;
  format: number;
  name: string;
  version: string;
  saved: string;
  /** Engine Tweak id -> enabled. Absent ids fall back to whatever the ROM's
   *  current bytes say, so old metadata (or ids added since) still work. */
  engineTweaks?: Record<string, boolean>;
  /** crystalis-tools build identity (from `__COMMIT_HASH__`/`__COMMIT_DATE__`),
   *  i.e. which build of the editor produced this patch - not user data. */
  toolCommitHash?: string;
  toolCommitDate?: string;
}

/** Editor-only project information. This is serialized into the BPS metadata
 * field and is never written into the NES header, PRG ROM, or CHR ROM. */
export class ProjectSettings {
  name: string;
  version: string;
  /** Engine Tweak id -> enabled, applied to `prg` at build time. */
  engineTweaks: Record<string, boolean>;
  /** ISO timestamp of the last successful BPS export, read-only in the UI.
   *  Null until the project has been saved at least once. */
  buildDate: string | null;
  /** Commit hash/date of the crystalis-tools build that produced this patch,
   *  read-only in the UI. Null when built without git available. */
  toolCommitHash: string | null;
  toolCommitDate: string | null;

  constructor(name = DEFAULT_NAME, version = DEFAULT_VERSION,
              engineTweaks: Record<string, boolean> = {}, buildDate: string | null = null,
              toolCommitHash: string | null = null, toolCommitDate: string | null = null) {
    this.name = name;
    this.version = version;
    this.engineTweaks = engineTweaks;
    this.buildDate = buildDate;
    this.toolCommitHash = toolCommitHash;
    this.toolCommitDate = toolCommitDate;
  }

  /** Encode a small, namespaced payload for the standard BPS metadata field.
   *  `saved` also becomes the new `buildDate`, stamped fresh on every export,
   *  along with the editor's own build commit identity. */
  toBpsMetadata(saved: string): string {
    this.buildDate = saved;
    this.toolCommitHash = __COMMIT_HASH__ ?? null;
    this.toolCommitDate = __COMMIT_DATE__ ?? null;
    const metadata: ProjectMetadata = {
      tool: METADATA_TOOL,
      format: METADATA_FORMAT,
      name: this.name,
      version: this.version,
      saved,
      engineTweaks: this.engineTweaks,
      toolCommitHash: this.toolCommitHash ?? undefined,
      toolCommitDate: this.toolCommitDate ?? undefined,
    };
    return JSON.stringify(metadata);
  }

  /** Read our metadata while remaining compatible with patches made by other
   * tools (or older Crystalis Tools patches with a plain-text metadata field). */
  static fromBpsMetadata(text: string): ProjectSettings {
    try {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object') return new ProjectSettings();
      const metadata = value as Partial<ProjectMetadata>;
      if (metadata.tool !== METADATA_TOOL || metadata.format !== METADATA_FORMAT ||
          typeof metadata.name !== 'string' || typeof metadata.version !== 'string') {
        return new ProjectSettings();
      }
      const engineTweaks = metadata.engineTweaks && typeof metadata.engineTweaks === 'object' ?
          metadata.engineTweaks : {};
      const buildDate = typeof metadata.saved === 'string' ? metadata.saved : null;
      const toolCommitHash = typeof metadata.toolCommitHash === 'string' ? metadata.toolCommitHash : null;
      const toolCommitDate = typeof metadata.toolCommitDate === 'string' ? metadata.toolCommitDate : null;
      return new ProjectSettings(
          metadata.name.slice(0, 80), metadata.version.slice(0, 32), engineTweaks, buildDate,
          toolCommitHash, toolCommitDate);
    } catch {
      return new ProjectSettings();
    }
  }
}
