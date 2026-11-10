export type AgentStatus = 'running' | 'done' | 'failed' | 'aborted'

export type WatchedAgent = {
  id: string
  description: string
  type: string
  model?: string
  parentId?: string
  background: boolean
  status: AgentStatus
  startedAt: number
  endedAt?: number
  toolCalls: number
  lastTool?: string
  answer?: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-watch': {
      agents: WatchedAgent[]
      selected: string | null
      isBandHidden: boolean
    }
  }
}
