# Contribution Log

이 문서는 이번 킥오프에서 AI가 작성했다. 학생의 작업을 관찰하거나 파일·변경·설명으로 확인하기 전에는 학생 기여로 표시하지 않는다. GitHub의 커밋 작성 계정·푸시 계정과 실제 작업 수행자를 구분한다.

## 출처 구분

| 구분 | 의미 |
|---|---|
| AI reference | 전달된 AI/상담 참고 코드. 원본 반입을 학생 구현으로 계산하지 않음 |
| AI-authored | 이번 세션 AI가 작성하거나 실행한 작업 |
| student-authored | 학생의 직접 설계·편집·검증을 근거로 확인한 작업 |
| student-authored with AI assistance | 학생 작업과 AI가 제공한 부분을 각각 적은 작업 |
| unverified legacy | 과거 파일은 있으나 실제 작성자를 확인하지 못한 작업 |

## 검증된 기록

| 날짜(KST) | 작업 ID | 실제 수행자 | 구분 | 수행 내용 | AI/타인 도움 | 커밋·파일·증거 | 결과·한계 |
|---|---|---|---|---|---|---|---|
| 2026-11-16 | SETUP-001 | AI assistant | AI-authored | 폴더·이전 대화·원본 Handoff·GitHub 메타데이터 확인, 프로젝트 범위 구분 및 기획 문서 작성 | 전체 작업 AI 수행 | KICKOFF_STATUS.md, REFERENCE_AUDIT.md, 이 문서; 커밋은 Git 이력 참조 | 준비 작업이며 학생 구현·실험 성과가 아님 |
| 2026-11-16 | REF-001 | AI assistant; 원본은 전달된 AI/상담 scaffold | AI reference | 검토된 소스/UI/테스트 5파일을 원문 그대로 격리 반입, 출처 표시 | 원본 AI 참고 자료 사용 | `2357563432cacadf47ae720bf5ef4232b2b34f0b`; reference/ai-starter/ATTRIBUTION.md | 학생 구현 아님; 출석 기능 없음 |
| 2026-11-16 | AUDIT-001 | AI assistant | AI-authored | 원본 6개 테스트 실행 및 3×3 지도 128개/384개 결과의 별도 BFS 대조, 입력 검증 결함 재현 | 감사 스크립트·실행·해석 모두 AI | evidence/starter-baseline/manifest.json, original-tests.tap, independent-audit.mjs 및 결과 JSON | 경로 탐색 소프트웨어의 제한된 검사이며 출석·센서·학생 실험 증거 아님 |
| 2026-11-16 | REPO-001 | AI assistant | AI-authored | 요청 이름의 새 비공개 저장소를 로그인된 GitHub Desktop으로 생성하고 로컬 origin 연결 | 전체 설정 AI 수행 | docs/KICKOFF_STATUS.md; 원격 기준 커밋 확인 | GitHub 계정 소유를 학생 코딩으로 간주하지 않음 |

## 학생 작업 기록 양식 — 아직 기록 없음

2026-11-16 사용자 확인: FingerRoll과 RoboMetrics는 별개 프로젝트다. AI가 README 제목과 EC 내부 양식에 두 이름을 결합한 오류를 수정했다. 이 수정은 AI 문서 정정이며 학생 구현 기여가 아니다.

Task ID / 날짜 / 실제 수행자 / 문제·가설 / 학생이 직접 결정·편집한 내용 / AI가 제안·작성한 범위 / 변경 파일 / 커밋 SHA / 실행 명령 / 입력·결과 파일 / 실패 및 한계 / 학생 설명 / 검토 상태를 적는다.

학생 과제의 계획·할당·완료 체크만으로 실제 기여가 성립하지 않는다. 학생이 실행했다고 말한 결과와 AI가 직접 실행해 확인한 결과도 구분한다. 같은 문제를 AI가 대신 구현한 경우 해당 코드는 AI-authored로 남기고, 학생의 별도 기여는 실제 변경과 설명으로 다시 확인한다.

## 커밋 운영

1. 원본의 검토된 코드·테스트 반입: `reference: import AI grid-planning starter (not student work)`.
2. 이번 AI 준비 작업: `docs: prepare AI-assisted FingerRoll kickoff`.
3. 학생 Task 001A: 학생이 직접 변경한 뒤 별도 커밋. 예: `feat: implement period boundary rule (student implementation)`; 실제 작성자 확인 전 이 문구를 쓰지 않는다.
4. 개선 커밋에는 왜 바꿨는지, 어떤 실패를 해결했는지, 무엇을 검증했는지 기록한다. 커밋 수를 실력·성과 지표로 사용하지 않는다.
