# agent-watch

agent-watch는 Claude Code에서 서브에이전트가 무엇을 하고 있는지 보여 주는 mod입니다. Claude가 `Agent` 도구로 서브에이전트를 띄우면 **Agents** pane에 부모와 자식 관계가 트리로 그려지고, 고른 에이전트의 반환값이 아래에 나옵니다. 진행 중인 에이전트는 프롬프트 위 밴드에 진행 바로도 보입니다.

> **English.** agent-watch is a Claude Code mod that shows what your subagents are doing. When Claude starts subagents with the `Agent` tool, the **Agents** pane draws them as a tree and shows the return value of the one you pick. A band above the prompt shows a progress bar for each running agent. Install it with the two commands below.

## 설치

Claude Code 프롬프트에서 두 명령을 차례로 실행합니다.

```
/plugin marketplace add impwy/agent-watch
/plugin install agent-watch@agent-watch
```

설치가 끝나면 새 세션을 엽니다. 세션이 시작될 때 **Agents** pane이 열립니다.

## 보기

- **Agents pane.** 맨 위에 `main`이 있고 그 아래로 서브에이전트가 트리로 붙습니다. 줄마다 상태 아이콘, 설명, 에이전트 종류, 도구 호출 수, 경과 시간, 지금 실행 중인 도구가 보입니다. 줄을 누르면 그 에이전트의 반환값이 아래 상자에 나옵니다. 아무것도 고르지 않으면 가장 최근에 끝난 에이전트를 보여 줍니다.
- **프롬프트 위 밴드.** 진행 중인 에이전트와 끝난 지 1분이 안 된 에이전트를 최대 4개까지 보여 줍니다. 서브에이전트는 할 일의 총량을 모르므로, 진행 바는 도구를 한 번 부를 때마다 한 칸씩 찹니다. **[pane 열기]**로 pane에 가고, **[숨기기]**로 밴드를 숨깁니다.
- **알림.** 에이전트가 실패하거나 중단되면 토스트로 알립니다.

상태 아이콘은 네 가지입니다.

| 아이콘 | 상태 |
| --- | --- |
| `◐` | 진행 중 |
| `●` | 완료 |
| `✕` | 실패 |
| `○` | 중단 |

데스크톱과 모바일 화면에서는 트리를 SVG 그림으로 그리고, 진행 중인 노드는 깜빡입니다. 터미널에서는 글자로 그립니다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `/agent-watch` | **Agents** pane을 열고 키 입력을 pane으로 옮긴다. |
| `/agent-watch clear` | 에이전트 기록을 지운다. |
| `/agent-watch band` | 프롬프트 위 밴드를 숨기거나 다시 보인다. |

## 한계

- 에이전트 기록은 최근 40개까지만 남깁니다. 반환값은 4,000자에서 자릅니다.
- 진행 바는 도구 호출 수를 셀 뿐이라, 끝까지 얼마나 남았는지는 알 수 없습니다.

## 고치기

| 파일 | 역할 |
| --- | --- |
| `hooks/register.tsx` | `/agent-watch` 명령, 에이전트 시작·도구 호출·종료 추적, pane과 밴드 그리기 |
| `tests/agent-watch.test.tsx` | 추적과 pane 동작 테스트 |
| `types/index.d.ts` | `WatchedAgent` 타입과 store 선언 |
| `.claude-plugin/plugin.json` | 플러그인 매니페스트 |
| `.claude-plugin/marketplace.json` | 이 저장소를 marketplace로 쓰기 위한 목록 |

코드를 고친 뒤에는 저장소 폴더에서 두 명령을 실행합니다.

```
claude plugin test .
claude plugin validate .
```

버그와 제안은 [GitHub Issues](https://github.com/impwy/agent-watch/issues)에 올립니다.

## 라이선스

[MIT](LICENSE)
