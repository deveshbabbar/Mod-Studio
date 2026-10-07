import { describe, expect, test } from 'claude-code/testing'

import { bar, modFromPath, parseSuggestions, progressOf } from './register'

const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

describe('helpers', () => {
  test('bar fills in proportion', async () => {
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(150, 4)).toBe('████')
  })
  test('modFromPath finds the mod a write lands in', async () => {
    expect(modFromPath('/root/.claude/dev-mods/abc/toh/hooks/register.tsx')).toBe('toh')
    expect(modFromPath('/home/user/app.ts')).toBe(undefined)
  })
  test('parseSuggestions reads a JSON list out of prose', async () => {
    const list = parseSuggestions('Here: [{"name":"Focus Timer","idea":"A pomodoro band","extras":"sounds"}] done')
    expect(list.length).toBe(1)
    expect(list[0]?.name).toBe('focus-timer')
    expect(parseSuggestions('no json')).toEqual([])
  })
  test('a fresh report from Claude wins over the file checklist', async () => {
    const mod = { name: 'toh', description: '', folder: '/x', percent: 35, step: 'Next: Tests', checklist: [], updatedAt: 1000 }
    expect(progressOf(mod, { percent: 70, step: 'writing hooks', at: 2000 }).percent).toBe(70)
    expect(progressOf(mod, undefined).percent).toBe(35)
  })
})

test('report_progress records progress and the band shows it', async $ => {
  const ran = await $.tool.call({ tool: 'mcp__mod-studio__report_progress', mod: 'toh', percent: 60, step: 'hooks module' })
  expect(ran.deny).toBe(undefined)
  expect(ran.result).toBe('Progress for toh recorded: 60% (hooks module).')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'mod-studio', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /60%/ })).toBeDefined()
    await ui.unmount()
  }
})
