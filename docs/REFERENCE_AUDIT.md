# Starter 및 Handoff 검증

검증일: **2026-11-16 KST**. 수행자: **Codex AI assistant**. 학생 작성·실행 성과로 계산하지 않는다.

## 원본과 출처

| 자료 | SHA-256 |
|---|---|
| `Junmo_RoboMetrics_Early_RD_Kickoff_2026-10-27.zip` | `211136cc54687af919f897fc4d19f86c25ae0365dd49ceadbc2424f56f646b61` |
| `Junmo_Engineering_EC_Master_Handoff_v2_2026-10-27.md` | `60472771df326048d8a93020a2d808ec7623d8633159b33c0b8ec7610765e432` |

이전 대화 첨부 목록은 비어 있었으나 로컬 받은 파일 폴더에서 원본을 찾았다. ZIP의 20개 항목, 비압축 합계 46,865바이트를 확인하고 절대 경로·폴더 이탈·과대 파일을 검사한 뒤 `local/reference-inputs/starter/`에 해제했다. 원본 파일은 수정하지 않았다.

Handoff는 이 자료를 AI/상담자의 격자 경로 탐색 참고 scaffold라고 명시한다. 옛 로봇 프로젝트 이름·일정·저장소 제안은 현재 사용자가 요청한 지문 출석 범위를 대신하지 않는다. 학생 개인 문서 링크와 입시 문서는 저장소에 반입하지 않았다.

검토한 코드/UI/테스트 5개만 `reference/ai-starter/`에 원문 그대로 반입했다. 별도 기준 커밋: `2357563432cacadf47ae720bf5ef4232b2b34f0b`. [출처 표시](../reference/ai-starter/ATTRIBUTION.md). 원본·작업 파일·커밋의 바이트 일치 및 SHA-256은 [검증 명세](../evidence/starter-baseline/manifest.json)에 기록한다. ZIP에 LICENSE는 없으며 임의 라이선스를 붙이지 않았다.

## 코드·알고리즘

- `src/core.mjs`: 정적 격자 생성, A*, Greedy Best-First, Dijkstra, 경로 검사, paired benchmark. `src/ui.mjs`와 HTML/CSS는 브라우저 데모다.
- 상하좌우 이동·단위 비용의 격자다. A*는 `g+h`, Greedy는 `h`, Dijkstra는 `g` 우선순위를 쓴다. Manhattan 휴리스틱은 이 격자 가정에서 일관적이다. 동률은 삽입 순서로 처리한다.
- Seeded LCG는 재현성을 위한 난수 생성이다. `expanded`는 시작·목표를 포함한 유효 pop 노드 수이며, 실제 소요 시간·에너지·로봇 성능 지표가 아니다.
- Benchmark는 Dijkstra로 도달 가능한 지도를 먼저 선택한 뒤 같은 지도·예산으로 비교한다. 성공률은 그 선택된 합성 지도 안의 비율이다. 경로 길이 평균은 각 방법의 성공 사례만 포함하므로 성공 집합이 다른 경우 직접적인 우열 일반화를 피해야 한다.
- 지문 등록/매칭·센서 통신·학생 식별·교시·출석/지각·저장·명단·미출석 알림·권한·동의·삭제 기능은 없다. 출석 구현 기준선으로 오인하지 않는다.

## 실제 검증 결과

Node.js v24.22.1, 추가 패키지 설치 없이 실행했다. 아래 명령은 저장소 루트 기준이다. 최초 로컬 추출본에서도 같은 원본 테스트 6개가 통과했고, 반입 기준선에서 다시 확인한 출력은 아래 증거에 보존했다. 두 실행을 독립적인 12개 테스트라고 합산하지 않는다.

```powershell
node --test --test-reporter=tap reference/ai-starter/test/core.test.mjs
node evidence/starter-baseline/independent-audit.mjs
```

| 검사 | 실제 결과 | 범위 |
|---|---|---|
| 원본 테스트 | 6 통과, 0 실패 | 원본의 여섯 테스트 |
| 별도 BFS 대조 | 3×3 지도 128개, 알고리즘 결과 384개 도달 여부 일치 | 시작 (0,0)·목표 (2,2) 고정, 나머지 7칸 전 조합. 도달 가능 51, 불가 77 |
| 최단 길이 | A*/Dijkstra가 BFS와 일치 | 위 작은 격자 조건에 한정; 모든 입력의 증명 아님 |
| 예산 경계 | 빈 3×3 지도 A* 예산 8 실패, 9 성공 | 해당 입력 한 건 |

[원본 테스트 출력](../evidence/starter-baseline/original-tests.tap), [AI 대조 스크립트](../evidence/starter-baseline/independent-audit.mjs), [대조 결과](../evidence/starter-baseline/independent-audit.json), [소스·입력·증거 해시](../evidence/starter-baseline/manifest.json).

## 확인된 한계와 결정

1. `verifyPath`는 좌표의 정수 여부를 검사하지 않아 빈 3×3 지도에서 `[[0,0],[0.5,0.5],[1,1],[1.5,1.5],[2,2]]`를 유효하다고 반환한다. 외부 입력 검증의 결함을 재현했으며, 정상 탐색기가 그 경로를 생성한다는 주장은 아니다. 원본을 보존했고 이번 과제에서 수정하지 않았다.
2. UI 설정 변경 후 과거 batch/export 상태가 남는 문제가 정적 코드 검토에서 확인됐다. 브라우저 동작 검증은 하지 않았다.
3. 이번 출석 개발은 별도 모듈로 시작한다. 첫 학생 과제는 [Task 001A](tasks/TASK_001A.md)이며, 경로 탐색 개선을 출석 시스템의 학생 성과로 바꾸어 기록하지 않는다.
