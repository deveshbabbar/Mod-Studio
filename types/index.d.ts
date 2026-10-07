export type ModInfo = {
  name: string
  description: string
  folder: string
  percent: number
  step: string
  checklist: { label: string; isDone: boolean }[]
  updatedAt: number
}

export type Report = { percent: number; step: string; at: number }

export type Suggestion = { name: string; idea: string; extras: string }

declare module 'claude-code' {
  interface PluginState {
    'mod-studio': {
      mods: ModInfo[]
      reports: Record<string, Report>
      active: string | null
      suggestions: Suggestion[]
      isSuggesting: boolean
      isBandHidden: boolean
    }
  }
}
