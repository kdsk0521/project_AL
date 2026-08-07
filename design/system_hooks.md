# 시스템 훅 대장 (Hook Ledger) v1.0

> 2026-07-17 · 트레잇 효과가 요구하는 엔진 소비처 현황. 규칙: 기능성 효과=훅 어휘 내에서만(spec §11-5 기울기), 신설 훅=여기 등재 후 배선.

## ✅ 배선 완료

| 훅 | 소비처 | 사용 트레잇 |
|---|---|---|
| **해금형 소형 훅 10종 (2026-07-21)** | | |
| — 부위해금전체(완전개방, when:호감도>=80 리졸버 평가) | training.getAvailableParts 선두 오버라이드 | AT_FULL_OPEN |
| — 행위 카테고리 필터(가학계·명령계) | training.getAvailableActions `a.traitCat` 검사 — **행위 태깅은 콘텐츠 패스에서**(현재 액션 무태깅, 필터만 준비) | 이마글자·복명체 / 가학성·여왕 |
| — 해금요구 ×0.8 완화 | 음란 임계 ceil(req×ease) | 순종적 곡예 |
| — 지정조합(조건반사) = **첫 절정 행위를 몸이 기억** → 반복 시 ×3 | execute 절정 후 _condCombo 기록 + repeatMul 배율 | AT_CONDITIONED |
| — 첫임계보너스(개화) 첫 절정 전부위 +10 (1회) | 절정 훅 블록 | AT_BLOOM |
| — 성격획득(순백인형) 침염 방향→PT 1개 (잠정 매핑: 연모→충직/복종→헌신/음란→파렴치/공포→소심/반감→고고) | 절정 훅 블록 | PT_PURE_DOLL |
| — 감도하락 immune(철벽감각) — 재배정 셔플서 하향 차단 | 감도랜덤재배정 훅 내 가드 (미래 하락 지점도 이 immune 검사) | AT_IRON_SENSE |
| — 월말생산 = 영혼력 +25/유닛/월 (잠정) | engine._processTraitMonthlyProduce (advanceMonth) | 황금알·야금계 |
| — 수계통행 — 수계 존 채집: 통행 0.9확률·×1.3 / 무통행 0.5·×0.7(빈손방지 폴백 1개 유지) | dungeon.getCollectibles | 사반신 |
| — pullTarget → 어그로 합산 | combat._aggro | (special 보유 트레잇) |
| 스모크: tests/smoke_unlocks.js 12/0 | | |
| **전투 special 리졸버 (combatSpecials.js — 2026-07-17)** | combat.js 4지점(라운드 시작/공격 산출/명중 부여/라운드 종료) | CT 전반 |
| — 구현 30: critUp·accUp·defPierce·defShred·dmgPerLewd·firstStrike·hitLowestSlot·**allInStrike+exhaustNextRound(회색 늑대)**·stackDmg·enemySpd/Acc/Ap/AtkDown·stun·dot독/열·reflect·counter·regen·physImmuneRound·debuffResist·randomResist·ambushImmune·allyHeal(펠리컨 오라)·selfHpCost·onHitSenGain/Pleasure(전투→조교) | 결정론 스모크 9/0 (tests/smoke_specials.js) | |
| — 스텁(대기): sealSkill·areaGrow·knockback·dispel·cleanse·revealEnemy·selfSpdUp/DefDown·extraHitOnFirst·autoExtraAttack·enemyAiDisrupt·hitStaggerImmune·fearResist(전투측)·nightBonus·pullTarget | 후속 소형 배선 | |

| 훅 | 소비처 | 사용 트레잇 |
|---|---|---|
| 절정임계 gainMult | training._applyChimyeomVariation (임계 배율) | 과민소체 |
| 쾌감전환.HP unlock | 절정 시 HP +20(잠정) | 금욕적 섭취·감각차폐 |
| 절정산물 unlock | 절정 시 아이템(매핑: 점액 산란→슬라임핵·화밀→촉매초 잠정) | 점액 산란·화밀체질 |
| 감도랜덤재배정 unlock | 절정 시 부위 감도 셔플 | 감각폭풍 |
| 반복페널티 gainMult | repeatMul 페널티 경감 | 인형 조서·태엽조교·자동인형 |
| (기존) aggroUp·taunt·coverAlly 등 | combat._aggro·AI | 수호·위압·도발·매성 등 |

## ⏳ 배선 대기 (우선순위순)

| 훅 | 예정 소비처 | 사용 트레잇 | 규모 |
|---|---|---|---|

| 가학계·명령계 unlock | training 행위 필터(카테고리 해금) | 가학성·여왕·이마글자·복명체 | 中 |
| 월말생산 unlock | engine 월말 정산 틱 | 황금알·야금계 | 小 |
| 수계통행 unlock | dungeon 존 게이팅 | 사반신·(수체) | 小 |
| 약물반응(=발효 콘텐츠 대기 — 소비재 사용 지점 자체가 미구현, 취기체질=발효 앵커) unlock | 소비재 사용 처리 | 취기체질 | 小 |
| 부위해금전체·첫임계보너스·지정조합·감도하락 immune·성격획득 | training 세부 | 완전개방·개화·조건반사·철벽감각·순백인형 | 中 |
| 노출효과·해금요구·약효·지식.*·생산·수급.*·가공·시설효율·발견·보상·교섭·회복 | 각 시스템 gainMult 소비(경제·탐사·관계) | 다수 | 中 — 시스템별 한 줄씩 |

## T5 설계 원칙 (2026-07-17 레티어스)

**"아예 이상하거나 아예 좋거나"** — T5는 극단만 허용, 중간 없음. 대정점(음↔양·원융·우화↔이형)·사고 T5(까마귀·키메라·공작·솔&루나) 도달 설계 시 이 원칙으로. 순서: 시스템 패스 → 통합 밸런싱 → T5.
