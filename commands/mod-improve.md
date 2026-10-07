---
description: Have Claude suggest and add features to one of your mods
argument-hint: <name>
---

Improve my Claude Code mod named `$ARGUMENTS`. It lives in a folder under `~/.claude/dev-mods/` (look one or two levels down for a `.claude-plugin/plugin.json` whose name matches). If I gave no name, list my mods there and ask which one.

1. Read the mod and suggest 5 improvements or extra features.
2. Implement the 2 most useful ones with the plugin-authoring skill.
3. Call the `mcp__mod-studio__report_progress` tool with `{ mod, percent, step }` after each step, then validate and test the mod.
