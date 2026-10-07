# Mod Studio 🔧

A Claude Code mod for building mods. See every mod you've made, watch Claude build new ones with a live progress bar, and get ideas for what to build next.

## Features

- **All your mods in one pane.** `/mods` opens Mod Studio. It lists every mod in `~/.claude/dev-mods` with a progress bar, what's left to do, and an **Improve** button.
- **Live build progress.** While Claude builds a mod you see something like:
  `🔧 toh ████████░░░░ 60% · writing hooks module   [Studio] [Hide]`
  Progress comes from two places:
  1. Claude reports each step with the `report_progress` tool.
  2. A checklist of the mod's files: manifest, hooks list, hooks module, tests, README and marketplace file.
- **Show it where you want.** Pick `band` (above the prompt), `status` (status line), `chat` (a live card in the chat from `/mod-status`) or `all` with the `placement` option in `/config`.
- **Idea generator.** `/mod-suggest [topic]` returns 5 mod ideas, each with bonus features. Press **Build** and Claude starts making the one you pick.
- **Improve existing mods.** `/mod-improve <name>` has Claude suggest 5 upgrades and build the 2 most useful.

## Commands

| Command | What it does |
| --- | --- |
| `/mods` | Open the Mod Studio pane |
| `/mod-new <name> <idea>` | Have Claude build a new mod and track its progress live |
| `/mod-status [name]` | Show a live progress card in the chat (add a name to see its checklist) |
| `/mod-suggest [topic]` | Get mod ideas to build |
| `/mod-improve <name>` | Have Claude suggest and add features to a mod |

Example:

```
/mod-new toh a pane that shows my todo list from TODO.md and lets me tick items off
```

## Install

In a Claude Code terminal session:

```
/plugin install mod-studio --marketplace deveshbabbar/mod-studio
```

Answer `y` to add the marketplace, then press Enter to install for your user.

## Develop

```
claude --plugin-dir ./mod-studio
claude plugin validate ./mod-studio
claude plugin test ./mod-studio
```

## License

MIT
