# ROM Modifications

This file tracks only genuine modifications to the game itself: new/patched
6502 assembly, new opcodes, changed ROM data formats, or anything else that
makes a modified ROM behave differently from vanilla. It does NOT cover
editor features that just read/write existing vanilla bytes exactly as the
game already does (even if understanding vanilla engine behavior was
needed to build the UI) — those aren't game modifications and don't belong
here.

Each entry should cover:
- What changed and why (new feature the vanilla ROM couldn't otherwise
  support, a bug fix, etc.).
- Exactly which bytes/addresses/opcodes were added or changed, with enough
  detail to locate and re-derive them (source file/line for any new asm).
- Compatibility notes: does it require a specific PRG bank/free-space
  region, does it break compatibility with unmodified saves, etc.

Nothing has been added to this project yet.
