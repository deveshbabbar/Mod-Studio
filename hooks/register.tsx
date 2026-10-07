import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModInfo, Report, Suggestion } from '../types'

const PANE = 'mod-studio'
const TOOL = 'mcp__mod-studio__report_progress'

const mods = atom({ plugin: 'mod-studio', key: 'mods' } as const, [])
const reports = atom({ plugin: 'mod-studio', key: 'reports' } as const, {})
const active = atom({ plugin: 'mod-studio', key: 'active' } as const, null)
const suggestions = atom({ plugin: 'mod-studio', key: 'suggestions' } as const, [])
const isSuggesting = atom({ plugin: 'mod-studio', key: 'isSuggesting' } as const, false)
const isBandHidden = atom({ plugin: 'mod-studio', key: 'isBandHidden' } as const, false)

// What a finished mod usually has, and how much each piece is worth.
const CHECKLIST = [
  { label: 'Manifest (plugin.json)', weight: 20, paths: ['.claude-plugin/plugin.json'] },
  { label: 'Hooks list (hooks.json)', weight: 15, paths: ['hooks/hooks.json'] },
  {
    label: 'Hooks module (register)',
    weight: 35,
    paths: ['hooks/register.tsx', 'hooks/register.ts', 'hooks/register.js', 'hooks/register.jsx'],
  },
  { label: 'Tests', weight: 15, paths: [] as string[] },
  { label: 'README', weight: 10, paths: ['README.md'] },
  { label: 'Marketplace file', weight: 5, paths: ['.claude-plugin/marketplace.json'] },
]

export const bar = (percent: number, width = 12) => {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const modFromPath = (path: string) => {
  const match = /\/dev-mods\/[^/]+\/([^/]+)\//.exec(path)
  return match ? match[1] : undefined
}

export const parseSuggestions = (text: string): Suggestion[] => {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const list = JSON.parse(text.slice(start, end + 1)) as unknown[]
    return list
      .filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null)
      .map(one => ({
        name: String(one.name ?? 'mod').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40),
        idea: String(one.idea ?? ''),
        extras: String(one.extras ?? ''),
      }))
      .filter(one => one.idea.length > 0)
      .slice(0, 6)
  } catch {
    return []
  }
}

const buildPrompt = (name: string, idea: string) =>
  [
    `Build a Claude Code mod named "${name}" that does this: ${idea}`,
    'Use the plugin-authoring skill.',
    `While you work, call the ${TOOL} tool after every step with { mod: "${name}", percent, step }:`,
    'planning ~10, manifest ~25, hooks module ~60, tests ~80, validated ~95, done 100.',
    'When it is finished, suggest 3 extra features I could add to it.',
  ].join(' ')

const improvePrompt = (mod: ModInfo) =>
  [
    `Look at my Claude Code mod "${mod.name}" in ${mod.folder} (${mod.description || 'no description'}).`,
    'Suggest 5 improvements or extra features, then implement the 2 most useful ones using the plugin-authoring skill.',
    `Report progress with the ${TOOL} tool ({ mod: "${mod.name}", percent, step }) as you go, and validate it at the end.`,
  ].join(' ')

async function scanMod($: EngineInterface, folder: string, name: string): Promise<ModInfo | undefined> {
  const manifest = `${folder}/.claude-plugin/plugin.json`
  if (!(await $.fs.exists(manifest))) return undefined
  let description = ''
  try {
    const parsed = JSON.parse(String(await $.fs.read(manifest))) as { name?: string; description?: string }
    description = parsed.description ?? ''
    name = parsed.name ?? name
  } catch {
    description = '(plugin.json does not parse yet)'
  }
  const hookFiles = await $.fs.list(`${folder}/hooks`).catch(() => [])
  const rootFiles = await $.fs.list(folder).catch(() => [])
  const hasTest = [...hookFiles, ...rootFiles].some(one => /\.test\.tsx?$/.test(one.name))
  const updatedAt = Math.max(0, ...hookFiles.map(one => one.mtimeMs), ...rootFiles.map(one => one.mtimeMs))

  const checklist: ModInfo['checklist'] = []
  let percent = 0
  for (const item of CHECKLIST) {
    let isDone = item.label === 'Tests' ? hasTest : false
    for (const path of item.paths) {
      if (await $.fs.exists(`${folder}/${path}`)) isDone = true
    }
    if (isDone) percent += item.weight
    checklist.push({ label: item.label, isDone })
  }
  const next = checklist.find(one => !one.isDone)
  const step = next ? `Next: ${next.label}` : 'Complete'

  return { name, description, folder, percent, step, checklist, updatedAt }
}

async function rescan($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? '~'
  const devMods = `${home}/.claude/dev-mods`
  const roots = [devMods]
  const parent = $.plugin.root.replace(/\/[^/]+\/?$/, '')
  if (!parent.startsWith(devMods)) roots.push(parent)

  const found = new Map<string, ModInfo>()
  for (const root of roots) {
    const entries = await $.fs.list(root).catch(() => [])
    for (const entry of entries) {
      if (entry.kind !== 'dir') continue
      const folder = `${root}/${entry.name}`
      const direct = await scanMod($, folder, entry.name)
      if (direct) {
        found.set(direct.folder, direct)
        continue
      }
      for (const child of await $.fs.list(folder).catch(() => [])) {
        if (child.kind !== 'dir') continue
        const mod = await scanMod($, `${folder}/${child.name}`, child.name)
        if (mod) found.set(mod.folder, mod)
      }
    }
  }
  const list = [...found.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  await update($, mods, () => list)
  await $.store.set('knownMods', list.map(one => one.name))
}

// Claude's own report wins over the file checklist while it is fresher.
export const progressOf = (mod: ModInfo, report: Report | undefined) =>
  report && report.at >= mod.updatedAt - 60_000
    ? { percent: report.percent, step: report.step }
    : { percent: mod.percent, step: mod.step }

let placement = 'all'
const shows = (where: string) => placement === 'all' || placement === where

async function refreshStatus($: EngineInterface) {
  if (!shows('status')) return
  const name = await read($, active)
  if (!name) return $.ui.status(undefined)
  const mod = (await read($, mods)).find(one => one.name === name)
  const report = (await read($, reports))[name]
  const { percent, step } = mod ? progressOf(mod, report) : (report ?? { percent: 0, step: 'starting' })
  $.ui.status(`🔧 ${name} ${bar(percent, 8)} ${percent}% · ${step}`)
}

async function startBuild($: EngineInterface, name: string, idea: string) {
  await update($, active, () => name)
  await update($, isBandHidden, () => false)
  await update($, reports, all => ({ ...all, [name]: { percent: 0, step: 'Queued', at: Date.now() } }))
  await refreshStatus($)
  void $.prompt.submit({ text: buildPrompt(name, idea) })
}

async function suggest($: EngineInterface, topic: string) {
  await update($, isSuggesting, () => true)
  const known = (await read($, mods)).map(one => one.name).join(', ') || 'none yet'
  const reply = await $.model.complete({
    model: 'haiku',
    maxTokens: 1200,
    timeoutMs: 45_000,
    prompt: [
      'Suggest 5 useful, buildable Claude Code mods (plugins that add panes, bands above the prompt, status lines,',
      'slash commands, toasts, tool-call guards or tools the model can call).',
      topic ? `Focus on: ${topic}.` : 'Mix productivity, fun and safety ideas.',
      `The person already made: ${known}. Do not repeat those.`,
      'Answer ONLY a JSON array of {"name": short-kebab-name, "idea": one sentence, "extras": one sentence of bonus features}.',
    ].join(' '),
  })
  const list = reply.isAnswered ? parseSuggestions(reply.text) : []
  await update($, suggestions, () => list)
  await update($, isSuggesting, () => false)
  return reply.isAnswered ? list : undefined
}

export const register: Register = (on, options) => {
  placement = String(options.placement ?? 'all')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Open Mod Studio: all your mods and their progress' })
    await $.command.register({
      name: 'mod-new',
      description: 'Have Claude build a new mod and watch its progress live',
      argumentHint: '<name> <what it should do>',
    })
    await $.command.register({
      name: 'mod-suggest',
      description: 'Get mod ideas you could build next',
      argumentHint: '[topic]',
    })
    await $.command.register({
      name: 'mod-improve',
      description: 'Have Claude suggest and add features to one of your mods',
      argumentHint: '<name>',
    })
    await $.command.register({
      name: 'mod-status',
      description: 'Show a live progress card for your mods in the chat',
      argumentHint: '[name]',
    })
    await $.tool.register({
      name: 'report_progress',
      description:
        'Report how far along a Claude Code mod (plugin) you are building is, so the person sees a live progress bar. Call it after each step of building a mod.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          mod: { type: 'string', description: 'The mod name, as in its plugin.json' },
          percent: { type: 'number', minimum: 0, maximum: 100 },
          step: { type: 'string', description: 'What was just done or is being done now, a few words' },
        },
        required: ['mod', 'percent', 'step'],
      },
    })

    await rescan($)
    $.clock.every(15_000, () => void rescan($).then(() => refreshStatus($)))
    await refreshStatus($)

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as { mod?: string; percent?: number; step?: string }
    const name = String(input.mod ?? '').trim()
    if (!name) return { deny: 'Give the mod name in `mod`.' }
    const percent = Math.round(Math.max(0, Math.min(100, Number(input.percent) || 0)))
    const step = String(input.step ?? '').slice(0, 120)
    await update($, reports, all => ({ ...all, [name]: { percent, step, at: Date.now() } }))
    await update($, active, () => name)
    await refreshStatus($)
    if (percent >= 100) $.ui.toast(`✅ Mod "${name}" is done`)

    return { result: `Progress for ${name} recorded: ${percent}% (${step}).` }
  })

  // Claude writing into a mod folder counts as progress on that mod.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : undefined
    const name = path ? modFromPath(path) : undefined
    if (name && name !== 'mod-studio' && (e.tool === 'Write' || e.tool === 'Edit')) {
      await update($, active, () => name)
      await rescan($)
      await refreshStatus($)
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await rescan($)
    await refreshStatus($)
    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await rescan($)
    await $.ui.open({ id: PANE, title: 'Mod Studio' })
    return { text: 'Mod Studio opened.' }
  })

  on('command.run', { command: 'mod-new' }, async ($, e) => {
    const [name = '', ...rest] = e.args.trim().split(/\s+/)
    const idea = rest.join(' ')
    if (!name || !idea) return { text: 'Usage: /mod-new <name> <what it should do>' }
    await startBuild($, name.toLowerCase(), idea)
    return { text: `Building mod "${name}". Watch it above the prompt, in the status line, or with /mod-status.` }
  })

  on('command.run', { command: 'mod-suggest' }, async ($, e) => {
    const list = await suggest($, e.args.trim())
    if (!list) return { text: 'Could not get ideas right now, try again.' }
    if (list.length === 0) return { text: 'No ideas came back, try a different topic.' }
    void $.ui.open({ id: PANE, title: 'Mod Studio' })
    const lines = list.map(one => `- **${one.name}**: ${one.idea}\n  _Extras:_ ${one.extras}`)
    return { text: `Mod ideas (press Build in Mod Studio, or run /mod-new <name> <idea>):\n\n${lines.join('\n')}` }
  })

  on('command.run', { command: 'mod-improve' }, async ($, e) => {
    const name = e.args.trim()
    await rescan($)
    const mod = (await read($, mods)).find(one => one.name === name)
    if (!mod) return { text: `No mod named "${name}". Run /mods to see them.` }
    await update($, active, () => mod.name)
    await update($, isBandHidden, () => false)
    void $.prompt.submit({ text: improvePrompt(mod) })
    return { text: `Asking Claude to improve "${mod.name}".` }
  })

  on('command.run', { command: 'mod-status' }, async ($, e) => {
    await rescan($)
    const name = e.args.trim()
    const list = (await read($, mods)).filter(one => !name || one.name === name)
    const all = await read($, reports)
    if (list.length === 0) return { text: name ? `No mod named "${name}".` : 'No mods yet. Try /mod-suggest.' }
    const lines = list.map(one => {
      const { percent, step } = progressOf(one, all[one.name])
      return `- **${one.name}** \`${bar(percent)}\` ${percent}% · ${step}`
    })
    return { text: lines.join('\n') }
  })

  // The /mod-status row in the chat, drawn live.
  on('ui.render', { component: 'CommandOutput', props: { command: 'mod-status' } }, async ($, e, next) => {
    if (!shows('chat') || e.props.isErrored) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const name = e.props.args.trim()
    const list = (await read($, mods)).filter(one => !name || one.name === name)
    if (list.length === 0) return next(e)
    const all = await read($, reports)
    return (
      <Box flexDirection="column">
        {list.map(one => {
          const { percent, step } = progressOf(one, all[one.name])
          return (
            <Box key={one.folder} flexDirection="column">
              <Text>
                <Text bold>{one.name}</Text>{' '}
                <Text color={percent >= 100 ? 'success' : 'claude'}>{bar(percent)}</Text> {percent}%
              </Text>
              <Text dimColor>  {step}</Text>
              {name !== '' &&
                one.checklist.map(item => (
                  <Text dimColor={item.isDone}>
                    {'  '}
                    {item.isDone ? '✔' : '○'} {item.label}
                  </Text>
                ))}
            </Box>
          )
        })}
      </Box>
    )
  })

  // The band above the prompt while a mod is being built.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!shows('band') || e.props.hasSurvey) return next(e)
    const name = await read($, active)
    if (!name || (await read($, isBandHidden))) return next(e)
    const mod = (await read($, mods)).find(one => one.name === name)
    const report = (await read($, reports))[name]
    const { percent, step } = mod ? progressOf(mod, report) : (report ?? { percent: 0, step: 'Starting' })
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text>
          🔧 <Text bold>{name}</Text>{' '}
          <Text color={percent >= 100 ? 'success' : 'claude'}>{bar(percent)}</Text> {percent}%{' '}
          <Text dimColor>{step} </Text>
        </Text>
        <Button key="studio" label="Studio" onPress={() => $.ui.open({ id: PANE, title: 'Mod Studio' })} />
        <Button
          key="hide"
          label="Hide"
          onPress={async () => {
            await update($, isBandHidden, () => true)
            if (percent >= 100) {
              await update($, active, () => null)
              $.ui.status(undefined)
            }
          }}
        />
      </Box>
    )
  })

  // The Mod Studio pane: every mod, its progress, and ideas to build next.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, mods)
    const all = await read($, reports)
    const ideas = await read($, suggestions)
    const isBusy = await read($, isSuggesting)
    const current = await read($, active)

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>
            {list.length} mod{list.length === 1 ? '' : 's'}{' '}
          </Text>
          <Button key="refresh" label="Refresh" onPress={() => rescan($)} />
          <Button
            key="suggest"
            label={isBusy ? 'Thinking…' : 'Suggest ideas'}
            variant="primary"
            onPress={() => (isBusy ? undefined : suggest($, ''))}
          />
        </Box>
        {list.length === 0 && <Text dimColor>No mods yet. Press Suggest ideas or run /mod-new.</Text>}
        {list.map(one => {
          const { percent, step } = progressOf(one, all[one.name])
          return (
            <Box key={one.folder} flexDirection="column" marginTop={1}>
              <Box>
                <Text>
                  {one.name === current ? '▶ ' : '  '}
                  <Text bold>{one.name}</Text>{' '}
                  <Text color={percent >= 100 ? 'success' : 'claude'}>{bar(percent, 10)}</Text> {percent}%{' '}
                </Text>
                <Button
                  key={`improve-${one.folder}`}
                  label="Improve"
                  onPress={async () => {
                    await update($, active, () => one.name)
                    await update($, isBandHidden, () => false)
                    await $.prompt.submit({ text: improvePrompt(one) })
                  }}
                />
              </Box>
              <Text dimColor wrap="truncate-end">
                {'    '}
                {step}
                {one.description ? ` · ${one.description}` : ''}
              </Text>
            </Box>
          )
        })}
        {ideas.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Ideas to build</Text>
            {ideas.map(idea => (
              <Box key={`idea-${idea.name}`} flexDirection="column" marginTop={1}>
                <Box>
                  <Text bold>{idea.name} </Text>
                  <Button
                    key={`build-${idea.name}`}
                    label="Build"
                    onPress={() => startBuild($, idea.name, `${idea.idea} Extras: ${idea.extras}`)}
                  />
                </Box>
                <Text>  {idea.idea}</Text>
                <Text dimColor>  + {idea.extras}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
