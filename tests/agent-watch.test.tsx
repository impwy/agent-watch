import { test, expect, mock } from 'claude-code/testing'

const PLUGIN = 'agent-watch'
const PANE_PROPS = {
  title: 'Agents',
  isFocused: false,
  bodyColumns: 100,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

test('빈 상태의 pane은 안내 문구를 그린다', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>engine</Text>
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'agent-watch', props: PANE_PROPS })
    const drawn = await ui.drawn()
    expect(JSON.stringify(drawn)).toContain('아직 실행된 에이전트가 없습니다')
    await ui.unmount()
  }
})

test('spawn → tool.call → turn.complete 순서로 상태와 반환값이 쌓인다', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>engine</Text>
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'agent-1' }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.agent.spawn({
    tool_use_id: 'toolu_1',
    prompt: '테스트 레포를 훑어봐',
    description: '레포 탐색',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-fable-5-1',
    background: false,
    fork: false,
  })

  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' } as never)

  const band = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  const bandText = JSON.stringify(await band.drawn())
  expect(bandText).toContain('레포 탐색')
  expect(bandText).toContain('진행 중')
  await band.unmount()

  await $.turn.complete({
    answer: '파일 3개를 찾았습니다.',
    durationMs: 1200,
    isAborted: false,
    turnId: 'turn-1',
    agentId: 'agent-1',
    reason: 'answer',
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'agent-watch', props: PANE_PROPS })
    const text = JSON.stringify(await pane.drawn())
    expect(text).toContain('레포 탐색')
    expect(text).toContain('완료')
    expect(text).toContain('파일 3개를 찾았습니다.')
    await pane.unmount()
  }
})
