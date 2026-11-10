import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentStatus, WatchedAgent } from '../types'

const PANE = 'agent-watch'
const MAX_AGENTS = 40
const ANSWER_LIMIT = 4000
const BAND_LINGER_MS = 60_000

const agents = atom({ plugin: 'agent-watch', key: 'agents' } as const, [])
const selected = atom({ plugin: 'agent-watch', key: 'selected' } as const, null)
const isBandHidden = atom({ plugin: 'agent-watch', key: 'isBandHidden' } as const, false)

const ICON: Record<AgentStatus, string> = { running: '◐', done: '●', failed: '✕', aborted: '○' }
const COLOR: Record<AgentStatus, 'claude' | 'success' | 'error' | 'inactive'> = {
  running: 'claude',
  done: 'success',
  failed: 'error',
  aborted: 'inactive',
}
const LABEL: Record<AgentStatus, string> = { running: '진행 중', done: '완료', failed: '실패', aborted: '중단' }

function short(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function seconds(from: number, to: number): string {
  const s = Math.max(0, Math.round((to - from) / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

/** 서브에이전트는 총량을 모르므로 도구 호출 수만큼 채워 가는 바를 그린다. */
function bar(agent: WatchedAgent, width: number): string {
  if (agent.status !== 'running') return '█'.repeat(width)
  const filled = Math.min(width - 1, agent.toolCalls)
  return '█'.repeat(filled) + '▒' + '░'.repeat(Math.max(0, width - filled - 1))
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)} … [+${text.length - max}자]` : text
}

type TreeRow = { agent: WatchedAgent; depth: number; isLast: boolean }

/** 부모 다음에 자식이 오도록 정렬하고 깊이를 붙인다. */
function treeOrder(list: WatchedAgent[]): TreeRow[] {
  const byParent = new Map<string | undefined, WatchedAgent[]>()
  for (const a of list) {
    const key = list.some(p => p.id === a.parentId) ? a.parentId : undefined
    const row = byParent.get(key) ?? []
    row.push(a)
    byParent.set(key, row)
  }
  const out: TreeRow[] = []
  const walk = (parent: string | undefined, depth: number) => {
    const kids = byParent.get(parent) ?? []
    kids.forEach((kid, i) => {
      out.push({ agent: kid, depth, isLast: i === kids.length - 1 })
      walk(kid.id, depth + 1)
    })
  }
  walk(undefined, 0)
  return out
}

const FILL: Record<AgentStatus, string> = {
  running: '#d97757',
  done: '#3fb950',
  failed: '#f85149',
  aborted: '#8b949e',
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c)
}

/** 데스크톱·모바일 surface용 트리 그림. */
function svgOf(rows: TreeRow[], now: number): string {
  const rowH = 34
  const w = 520
  const h = 50 + rows.length * rowH
  const nodes = rows
    .map(({ agent, depth }, i) => {
      const x = 30 + depth * 40
      const y = 40 + i * rowH
      const link =
        depth > 0
          ? `<line x1="${x - 40}" y1="${y - rowH + 8}" x2="${x - 40}" y2="${y}" stroke="#8b949e"/>` +
            `<line x1="${x - 40}" y1="${y}" x2="${x - 8}" y2="${y}" stroke="#8b949e"/>`
          : `<line x1="22" y1="${y - rowH + 8}" x2="22" y2="${y}" stroke="#8b949e"/><line x1="22" y1="${y}" x2="${x - 8}" y2="${y}" stroke="#8b949e"/>`
      const pulse =
        agent.status === 'running'
          ? '<animate attributeName="r" values="7;10;7" dur="1.2s" repeatCount="indefinite"/>'
          : ''
      const t = seconds(agent.startedAt, agent.endedAt ?? now)
      return (
        `${link}<circle cx="${x}" cy="${y}" r="8" fill="${FILL[agent.status]}">${pulse}</circle>` +
        `<text x="${x + 16}" y="${y + 4}" font-size="13" fill="#e6edf3">${escapeXml(agent.description)}</text>` +
        `<text x="${w - 16}" y="${y + 4}" font-size="11" fill="#8b949e" text-anchor="end">${escapeXml(agent.type)} · ${agent.toolCalls} tools · ${t}</text>`
      )
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" rx="8" fill="#0d1117"/>` +
    `<circle cx="22" cy="18" r="6" fill="#58a6ff"/><text x="36" y="22" font-size="12" fill="#8b949e">main</text>${nodes}</svg>`
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-watch',
      description: '서브에이전트 진행 상황과 반환값 pane을 연다 (clear: 기록 삭제, band: 밴드 토글)',
      argumentHint: '[clear|band]',
    })
    void $.ui.open({ id: PANE, title: 'Agents' })

    // 진행 중인 에이전트가 있는 동안 1초마다 경과 시간을 다시 그린다.
    const tick = async (): Promise<void> => {
      await $.clock.sleep(1000)
      const list = await read($, agents)
      if (list.some(a => a.status === 'running')) $.ui.invalidate('ui.render')
      void tick()
    }
    void tick()

    return next(e)
  })

  on('command.run', { command: 'agent-watch' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'clear') {
      await update($, agents, () => [])
      await update($, selected, () => null)
      return { text: '에이전트 기록을 지웠습니다.' }
    }
    if (arg === 'band') {
      const hidden = !(await read($, isBandHidden))
      await update($, isBandHidden, () => hidden)
      return { text: hidden ? '진행률 밴드를 숨겼습니다.' : '진행률 밴드를 다시 보입니다.' }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Agents', focus: true })
    return {
      text: opened.isPlaced ? 'Agents pane을 열었습니다.' : `pane을 그릴 수 없습니다: ${opened.reason}`,
    }
  })

  // 에이전트 시작: 목록에 등록
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || !started.agentId) return started
    const agent: WatchedAgent = {
      id: started.agentId,
      description: e.description,
      type: e.subagentType,
      model: started.model,
      parentId: e.parentAgentId,
      background: e.background,
      status: 'running',
      startedAt: await $.clock.now(),
      toolCalls: 0,
    }
    const list = await update($, agents, list =>
      [...list.filter(a => a.id !== agent.id), agent].slice(-MAX_AGENTS),
    )
    $.ui.status(`agents: ${list.filter(a => a.status === 'running').length} running`)
    return started
  })

  // 서브에이전트 루프의 도구 호출: 진행 상황 갱신
  on('tool.call', async ($, e, next) => {
    if (!e.agentId) return next(e)
    const id = e.agentId
    const tool = String(e.tool)
    await update($, agents, list =>
      list.map(a => (a.id === id ? { ...a, toolCalls: a.toolCalls + 1, lastTool: tool } : a)),
    )
    return next(e)
  })

  // 서브에이전트 턴 종료: 반환값 저장
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) return next(e)
    const id = e.agentId
    const status: AgentStatus =
      e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'aborted' : 'failed'
    const now = await $.clock.now()
    const answer = clip(e.answer, ANSWER_LIMIT)
    const list = await update($, agents, list =>
      list.map(a => (a.id === id ? { ...a, status, endedAt: now, answer, lastTool: undefined } : a)),
    )
    const running = list.filter(a => a.status === 'running').length
    $.ui.status(running > 0 ? `agents: ${running} running` : undefined)
    const me = list.find(a => a.id === id)
    if (me && status !== 'done') $.ui.toast(`에이전트 ${LABEL[status]}: ${me.description}`)
    return next(e)
  })

  // Pane: 트리 그림 + 선택한 에이전트의 반환값
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, agents)
    const pick = await read($, selected)
    const now = await $.clock.now()
    const rows = treeOrder(list)
    const current =
      list.find(a => a.id === pick) ?? [...list].reverse().find(a => a.answer !== undefined) ?? list.at(-1)

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text dimColor>아직 실행된 에이전트가 없습니다.</Text>
          <Text dimColor>Agent 도구로 서브에이전트가 뜨면 여기에 트리와 반환값이 보입니다.</Text>
        </Box>
      )
    }

    const running = list.filter(a => a.status === 'running').length
    let picture
    if (e.surface === 'terminal') {
      picture = (
        <Box flexDirection="column">
          <Text dimColor>◆ main</Text>
          {rows.map(({ agent, depth, isLast }) => {
            const t = seconds(agent.startedAt, agent.endedAt ?? now)
            const branch = `${'│  '.repeat(depth)}${isLast ? '└─' : '├─'}`
            const meta = `${agent.type} · ${agent.toolCalls}🔧 ${t}${agent.lastTool ? ` · ${agent.lastTool}` : ''}`
            return (
              <Button key={`pick:${agent.id}`} plain onPress={() => update($, selected, () => agent.id)}>
                <Text dimColor>{branch}</Text>
                <Text color={COLOR[agent.status]}>{ICON[agent.status]} </Text>
                <Text bold={agent.id === current?.id}>{agent.description} </Text>
                <Text dimColor>{meta}</Text>
              </Button>
            )
          })}
        </Box>
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      picture = (
        <Box flexDirection="column" gap={1}>
          <Svg source={svgOf(rows, now)} alt={`${list.length}개 에이전트의 트리, ${running}개 진행 중`} isInteractive />
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {rows.map(({ agent }) => (
              <Button
                key={`pick:${agent.id}`}
                label={`${ICON[agent.status]} ${agent.description}`}
                onPress={() => update($, selected, () => agent.id)}
              />
            ))}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text bold>
            에이전트 트리 <Text dimColor>({running} 진행 중 / {list.length})</Text>
          </Text>
          {picture}
        </Box>
        {current && (
          <Box
            key="detail"
            flexDirection="column"
            borderStyle="round"
            borderColor={COLOR[current.status]}
            paddingX={1}
          >
            <Box flexDirection="row" gap={1}>
              <Text color={COLOR[current.status]}>
                {ICON[current.status]} {LABEL[current.status]}
              </Text>
              <Text bold>{current.description}</Text>
              <Text dimColor>
                {current.type}
                {current.model ? ` · ${current.model}` : ''} · {short(current.id)}
              </Text>
            </Box>
            <Text dimColor>
              {current.toolCalls}회 도구 호출 · {seconds(current.startedAt, current.endedAt ?? now)}
              {current.background ? ' · background' : ''}
            </Text>
            <Text> </Text>
            {current.answer !== undefined ? (
              <Text key="answer" wrap="wrap">
                {current.answer.length > 0 ? current.answer : '(빈 응답)'}
              </Text>
            ) : (
              <Text key="answer" dimColor>
                {current.lastTool ? `지금 ${current.lastTool} 실행 중…` : '아직 반환값이 없습니다.'}
              </Text>
            )}
          </Box>
        )}
      </Box>
    )
  })

  // 프롬프트 위 밴드: 에이전트별 진행 바
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, agents)
    const hidden = await read($, isBandHidden)
    const now = await $.clock.now()
    const show = list.filter(
      a => a.status === 'running' || (a.endedAt !== undefined && now - a.endedAt < BAND_LINGER_MS),
    )
    if (e.props.hasSurvey || hidden || show.length === 0) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(40, e.props.bodyColumns)
    const barWidth = 12
    const nameWidth = Math.max(10, Math.min(28, width - barWidth - 44))

    return (
      <Box flexDirection="column">
        {show.slice(-4).map(agent => (
          <Box key={`row:${agent.id}`} flexDirection="row" gap={1}>
            <Text color={COLOR[agent.status]}>{ICON[agent.status]}</Text>
            <Box width={nameWidth}>
              <Text wrap="truncate-end">{agent.description}</Text>
            </Box>
            <Text color={COLOR[agent.status]}>{bar(agent, barWidth)}</Text>
            <Text dimColor wrap="truncate-end">
              {LABEL[agent.status]} · {agent.toolCalls}🔧 · {seconds(agent.startedAt, agent.endedAt ?? now)}
              {agent.lastTool ? ` · ${agent.lastTool}` : ''}
            </Text>
          </Box>
        ))}
        <Box flexDirection="row" gap={1}>
          <Text dimColor>agent-watch</Text>
          <Button
            key="open"
            plain
            label="[pane 열기]"
            onPress={() => $.ui.open({ id: PANE, title: 'Agents', focus: true })}
          />
          <Button key="hide" plain label="[숨기기]" onPress={() => update($, isBandHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
