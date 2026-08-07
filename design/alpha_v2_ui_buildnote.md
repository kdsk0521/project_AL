# 알파 v2 빌드 노트 — 목업 6장 이식 + 엔진 확장 (2026-06-10)

> 목업(design/mockups) 6장을 renderer에 이식하고, 목업이 요구하는 엔진 시스템 2종(AP 행동/삼원질 추출)을 신규 구현.
> 수치는 전부 **잠정** — 통합 밸런싱 패스에서 조정.

## 엔진 변경

| 항목 | 파일 | 내용 |
|---|---|---|
| AP 행동 시스템 | engine.js | `state.ap/apMax(3)`, `spendAction()/canAct()`, advanceDay 시 회복, `ensureV2State()`로 구세이브 호환 |
| 삼원질 비축 | engine.js | `state.prima {염,수은,유황}` |
| 변용 헬퍼 | engine.js | `getVariationRoutes()/getVariationTrait()/getSigilName()` |
| 시그니처 부여 | systems/training.js | 변용 도 도달 시 variationRoutes 트레잇을 unit.traits에 실제 부여 (기존: 도만 상승) |
| 삼원질 추출 | **systems/extraction.js (신규)** | 도1+ 자격 · 공통 대가(변용 리셋+시그니처 회수+영혼력 1,200) · 體神魂 종류별 대가(염=감도/수은=역가·경험-25%/유황=트레잇 1칸) · 보존=호감도·印 |
| 합체 삼원질 | systems/unit.js | `executeFusion(a,b,{prima})` — 염=직접슬롯+1(소재 印7과 통합), 수은=분열 모순쌍 통합 강제(resolution 플래그), 유황=잠재 인하 2배(상한 90%) · 합체 비용 `50×(LvA+LvB)` 신설 |

## UI 변경 (v2 패널 레이어)

- `index.html` — `#panel-screen` 전면 패널 + `#v2-tip` 툴팁 + 조교 대시보드에 침염/변용/쾌감 컨테이너
- `styles.css` — v2 스타일 전부 `#panel-screen` 스코프로 추가 (기존 v1 무손상)
- `screens/panels.js` (신규) — openPanel/closePanel/setPanelKeys/traitChip/bindPanelTips 공통 인프라
- `screens/hub.js` (신규) — **메인 행동 허브** (town 허브 대체: `showTownMenu` 오버라이드). 메인 행동 1~6=AP 1, 상시 7~9·i/t/s 무료, 0=하루 넘기기(월말 정산 포함). 거처 방문(교류) 간이 패널 포함
- `screens/unitlist2.js` (신규) — 유닛 명부: 정렬/필터, 글로벌5·침염·변용 사다리·감도·트레잇 툴팁, [Enter]조교/[B]편성/[F]합체
- `screens/extraction2.js` (신규) — 삼원질 추출: 體神魂 카드 + 희생 미리보기 + 유황 트레잇 선택
- `screens/fusion2.js` (신규) — 합체: 印 등식, 계승 3경로 미리보기(근사), 모순쌍 검출(수은 통합 표시), 비축 주입 바이얼
- `screens/combat2.js` (신규) — 전투 관전: HP바 전장 + 색 로그 + 한 턴/자동(0.9s)/도주 + 전투용 소모품 칩. 종료 시 v1 결과 흐름 합류
- `screens/training.js` — 대시보드에 침염 도장·변용 사다리·쾌감 게이지 + 절정/침염/변용/시그니처 로그

## 잠정 수치 (밸런싱 패스 대상)

- AP 3/일 · 추출 영혼력 1,200 · 합체 비용 50×(LvA+LvB)
- 염 추출: 감도 60+ 부위 ×0.4, 나머지 -12 / 수은: 역가 -1Lv + 경험치 -25% / 유황: 선택 1칸
- 절정 임계 표시 100+내성×20 (v1 조교 쾌감 피드 ×5 보정 유지)

## 미구현 / 다음

- [ ] 고통 게이지·가학 행위 (목업엔 있음 — v1 행위 테이블에 가학 결 없음, §G 조교엔진 풀 반영 시)
- [ ] 名器(부위 조교완료 시그니처) 부여 트리거 — partSignatures.csv 연결
- [ ] 모순쌍 통합/분열 **결과 트레잇 생산** (현재 검출+resolution 플래그까지)
- [ ] 광장(교환) 콘텐츠 — 현재 전서 구매/납품으로 매핑
- [ ] 활성 印 보너스를 조교/전투 경험에 실제 적용 (현재 납품가만)

## 검증

- 통합 스모크 PASS 12/0 (jsdom): 허브 AP 소비/회복 → 조교 절정·침염·변용·시그니처 → 명부 → 추출(염) → 합체(염 주입) → 전투 관전 종료 → 세이브 v2 호환
