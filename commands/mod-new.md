---
description: Have Claude build a new mod and watch its progress live
argument-hint: <name> <what it should do>
---

Build a Claude Code mod from this request: $ARGUMENTS

- The first word is the mod's name. Make it lowercase kebab-case and drop any punctuation (`context-counter:` becomes `context-counter`). If no idea follows the name, ask me what the mod should do before starting.
- Use the plugin-authoring skill to build it.
- Call the `mcp__mod-studio__report_progress` tool with `{ mod, percent, step }` before you start and after every step: planning 10, manifest 25, hooks module 60, tests 80, validated 95, README 100.
- When it is finished, tell me where it is and how to load it, and suggest 3 extra features I could add.
