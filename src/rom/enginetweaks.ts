import {readLE16} from './bytes';

/**
 * Toggleable pieces of hardcoded engine behaviour that aren't part of any
 * data table the rest of the editor already models (locations, items,
 * NPCs, ...). Each tweak pokes a couple of PRG bytes directly; "disabling"
 * a tweak restores those bytes from `originalPrg` (the untouched vanilla
 * image), so toggling never depends on remembering prior state.
 */
export interface EngineTweak {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  isEnabled(prg: Uint8Array): boolean;
  setEnabled(prg: Uint8Array, originalPrg: Uint8Array, enabled: boolean): void;
}

/**
 * The itemget table lives at bank $0e, CPU $9b00: a 2-byte pointer per
 * itemget id into a variable-length record (inventoryRowStart,
 * inventoryRowLength, a 2-byte "acquisition" MessageId, then flags).
 * Pointers resolve into one of two 8KB windows (banks $0e/$0f) depending on
 * their high bits.
 */
const ITEMGET_TABLE = 0x1db00;
const ITEMGET_SEG_0E = {org: 0x8000, flat: 0x1c000};
const ITEMGET_SEG_0F = {org: 0xa000, flat: 0x1e000};

function itemGetRecordOffset(prg: Uint8Array, id: number): number {
  const ptr = readLE16(prg, ITEMGET_TABLE + id * 2);
  const seg = (ptr & 0xe000) === ITEMGET_SEG_0E.org ? ITEMGET_SEG_0E :
              (ptr & 0xe000) === ITEMGET_SEG_0F.org ? ITEMGET_SEG_0F : null;
  if (!seg) {
    throw new Error(
        `Itemget $${id.toString(16)}: pointer $${ptr.toString(16)} ` +
        `doesn't fall in either itemget bank.`);
  }
  return seg.flat + (ptr - seg.org);
}

/** Offset of the acquisition MessageId's first byte: bits 3-7 are the
 *  "action" (what happens on pickup beyond the normal item-get popup),
 *  bits 0-2 are the low bits of the message part and are left untouched. */
function acquisitionActionOffset(prg: Uint8Array, id: number): number {
  return itemGetRecordOffset(prg, id) + 2;
}

const SWORD_OF_THUNDER_ITEMGET_ID = 0x03;
/** Action code used by every other sword's pickup - no special engine
 *  behaviour beyond the normal "you found a sword" popup. */
const NORMAL_SWORD_ACTION = 0x16;

const NO_THUNDER_SWORD_WARP: EngineTweak = {
  id: 'noThunderSwordWarp',
  name: 'No Sword of Thunder warp',
  description:
      'Vanilla immediately warps the player to Shyron (triggering the ' +
      'massacre cutscene) the instant the Sword of Thunder is picked up. ' +
      'Enabling this makes picking it up behave like any other sword instead.',
  isEnabled(prg) {
    const offset = acquisitionActionOffset(prg, SWORD_OF_THUNDER_ITEMGET_ID);
    return (prg[offset] & 0xf8) === (NORMAL_SWORD_ACTION << 3 & 0xf8);
  },
  setEnabled(prg, originalPrg, enabled) {
    const offset = acquisitionActionOffset(prg, SWORD_OF_THUNDER_ITEMGET_ID);
    const lowBits = prg[offset] & 0x07;
    const actionBits = enabled ?
        NORMAL_SWORD_ACTION << 3 & 0xf8 : originalPrg[offset] & 0xf8;
    prg[offset] = lowBits | actionBits;
  },
};

/**
 * Title screen's "waiting for input" state re-checks Start every frame at
 * PRG $26749 (CPU $a749): `LDA $4b; AND #$10; BNE $a77d`. $4b holds this
 * frame's newly-pressed buttons; if Start (bit 4) isn't set, a countdown
 * eventually auto-plays the "1997, End Day" / "Savage war engulfs the
 * world" narrative before continuing to name entry. $a77d - the same place
 * a real Start press jumps to - advances past that narrative immediately.
 */
const TITLE_START_CHECK = 0x26749;

const SKIP_INTRO_NARRATIVE: EngineTweak = {
  id: 'skipIntroNarrative',
  name: 'Skip intro narrative',
  description:
      'Vanilla auto-plays the "1997, End Day" / "Savage war engulfs the ' +
      'world" narrative on the title screen after a few idle seconds. ' +
      'Enabling this makes the title screen behave as if Start were ' +
      'pressed immediately, skipping straight past it to name entry.',
  isEnabled(prg) {
    return prg[TITLE_START_CHECK] === 0xa9 && prg[TITLE_START_CHECK + 1] === 0x10;
  },
  setEnabled(prg, originalPrg, enabled) {
    if (enabled) {
      prg[TITLE_START_CHECK] = 0xa9; // LDA #$10 - Start always reads as pressed.
      prg[TITLE_START_CHECK + 1] = 0x10;
    } else {
      prg[TITLE_START_CHECK] = originalPrg[TITLE_START_CHECK];
      prg[TITLE_START_CHECK + 1] = originalPrg[TITLE_START_CHECK + 1];
    }
  },
};

/**
 * "Input Code Name" init (PRG $263ed, CPU $a3ed) blanks the 6-byte name
 * buffer at $6418-$641d (writing sentinel $10 to each byte), then falls
 * through into the interactive letter-grid loop. The finalize routine at
 * CPU $a4e3 - reached once the player presses END - rechecks those 6 bytes;
 * if every one is still $10 (name left blank) it copies a default name from
 * the table at PRG $2656e (vanilla: "S N K ", a hidden dev credit) into the
 * buffer instead, then continues exactly like a normal END press. Jumping
 * straight from the blank-init to that finalize routine skips the
 * interactive loop entirely, so it behaves as if the player left the name
 * blank and immediately pressed END.
 */
const NAME_ENTRY_INIT_TAIL = 0x263ed;
const NAME_ENTRY_FINALIZE_CPU_ADDR = 0xa4e3;
const DEFAULT_NAME_TABLE = 0x2656e;
const DEFAULT_NAME = [0x48, 0x45, 0x52, 0x4f, 0x20, 0x20]; // "HERO  "

const SKIP_NAME_ENTRY: EngineTweak = {
  id: 'skipNameEntry',
  name: 'Skip name entry',
  description:
      'Vanilla stops at an interactive "Input Code Name" screen before ' +
      'the game starts. Enabling this skips straight past it, as if the ' +
      'name were left blank and END were pressed immediately, defaulting ' +
      'the name to "HERO" instead of the vanilla blank-name default.',
  isEnabled(prg) {
    return prg[NAME_ENTRY_INIT_TAIL] === 0x4c &&
        DEFAULT_NAME.every((b, i) => prg[DEFAULT_NAME_TABLE + i] === b);
  },
  setEnabled(prg, originalPrg, enabled) {
    if (enabled) {
      prg[NAME_ENTRY_INIT_TAIL] = 0x4c; // JMP $a4e3
      prg[NAME_ENTRY_INIT_TAIL + 1] = NAME_ENTRY_FINALIZE_CPU_ADDR & 0xff;
      prg[NAME_ENTRY_INIT_TAIL + 2] = NAME_ENTRY_FINALIZE_CPU_ADDR >> 8;
      for (let i = 3; i < 9; i++) prg[NAME_ENTRY_INIT_TAIL + i] = 0xea; // NOP
      DEFAULT_NAME.forEach((b, i) => { prg[DEFAULT_NAME_TABLE + i] = b; });
    } else {
      for (let i = 0; i < 9; i++) {
        prg[NAME_ENTRY_INIT_TAIL + i] = originalPrg[NAME_ENTRY_INIT_TAIL + i];
      }
      for (let i = 0; i < 6; i++) {
        prg[DEFAULT_NAME_TABLE + i] = originalPrg[DEFAULT_NAME_TABLE + i];
      }
    }
  },
};

/** All engine tweaks, in display order. */
export const ENGINE_TWEAKS: readonly EngineTweak[] =
    [NO_THUNDER_SWORD_WARP, SKIP_INTRO_NARRATIVE, SKIP_NAME_ENTRY];
