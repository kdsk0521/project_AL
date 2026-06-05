# 트레잇 데이터 스펙 / 엔진 어휘 (v0.1)

> 작성: 2026-05-31
> 목적: 트레잇 효과·조건·다리를 **데이터로 표현**해서 콘텐츠 추가 = JSON 행 추가가 되게(코드 수정 X). 대량 콘텐츠/밸런싱 전 한 번 못 박는 틀.
> 허브·지도: trait_era_transform.md §0. 정본 시스템: system_trait_synthesis.md v0.4.
> 원칙: **엔진(파서/리졸버)은 어휘만 안다. 콘텐츠는 전부 데이터.** 새 효과 종류 나올 때만 어휘 1개 추가(드문 코드 터치).

---

## 1. 트레잇 스키마 (traits.json 확장)

```jsonc
{
  "id": "AT_LONGING",
  "name": "연모",
  "category": "adult",          // combat|personality|adult|body — 슬롯 상한·습득결·가독성용
  "tier": 2,
  "rarity": "일반",             // 일반|시그니처|환상
  "subTags": { "main": "관계", "sub": "연모" },   // 가중치 추첨용
  "acquire": "변용:애착:1",      // 후보풀 / 변용:루트:도 / 합성 / 부위시그 / 초기
  "effects": [ /* §2 */ ],
  "bridges": [ /* §4 — 전투 다리 */ ],
  "landscapeTags": { /* BT 일부 */ }
}
```

- `effects` = 평상시 효과(조교·관계·생활). `bridges` = 자동전투 발현(교차 영향). 분리.
- 효과 영역은 effect의 `domain`이 정함 — 카테고리가 안 가둠(교차 영향).

---

## 2. Effect(modifier) 스키마

```jsonc
{ "domain": "조교", "target": "global.연모", "op": "gainMult", "value": 1.25, "when": {/*조건, 선택*/} }
```

### op 어휘
| op | 의미 |
|---|---|
| gainMult | 상승량 배율 (연모 상승 +25% = 1.25) |
| add / mult / set | 값 가감 / 배율 / 고정 |
| cap | 상한 변경 (쾌감상한 −50%) |
| thresholdMult | 임계 변경 (절정 임계·침염 ΔS) |
| immune | 면역 (공포 immune) |
| unlock | 행위/제한 해제 (음마 제한 해제) |
| gate | 해금 조건 완화/강화 |

### target 어휘
`global.{연모|복종|음란|공포|반감}` · `감도.{부위}` · `쾌감상한.{부위}` · `역가.{숙련|내성}.{부위}` · `역가.{공격숙련|방어숙련}.{속성: 물리|열|위|광|동|식|자}` · `침염.{종류}` · `HP|ATK|DEF|속도|회피|敵対心` · `defense.{물리|열|위|광|동|식|자}` · `호감도|호감도단계` · `윤활|욕정|고통`(보조 PALAM) · `변용도.{루트}` · `지식.{연금|조합|경영|魔物|역사|요리|예술|수영|낚시|농업}`(지식 레벨 층)

### domain 어휘
`조교 | 관계 | 생활 | 탐사`  (전투는 bridges로 분리)

---

## 3. Condition 스키마 (effects·bridges 공용 `when`)

```jsonc
{ "stat": "hpPct", "cmp": "<", "value": 0.3 }
```
- stat 어휘: `hpPct` · `동석:{유닛/주인}` · `호감도단계` · `변용도.{루트}` · `침염.{종류}` · `global.{X}` · `성향:{S|M}` · `인활성기:{인}`
- cmp: `< > >= <= = contains`
- 복합: `{ "all":[...] }` / `{ "any":[...] }`

---

## 4. Bridge 스키마 (자동전투 훅 — AI 기제 5종)

```jsonc
{ "type": "override", "when": {…}, "force": { "방어": 0.9 }, "priority": "성격" }
{ "type": "stat",     "stat": "ATK", "op": "add", "value": 0.3, "scaleBy": "missingHpPct" }
{ "type": "weight",   "action": "공격", "delta": 0.3 }
{ "type": "target",   "rule": "lowHp" }       // lowHp|weakpoint|threat|random|protectMaster
{ "type": "special",  "effect": "enemyAccDown", "value": 0.1 }  // 적디버프/아군버프/상태 — 어휘 확장형
; special 어휘(CT 보강으로 확장): enemyAccDown·enemyAtkDown·enemyApDown·enemySpeedDown·enemyDefDown·enemyAiDisrupt·enemyBuffStrip / physReflect·lightReflect·reflect·revealWeak·markWeak·defIgnoreChance·linkDamage·sealTrait·preventFlee·healBlock·마비·행동정지·dot독·predictEnemy·extraAction·fateReroll·zoneControl / allyHeal·allyCleanse·allyNullify·allyEvasion·allyStatusResist·allyDmgBuff·allyDefBuff·allyPowerBuff·allySupport·coverAlly·fearResist·hitStaggerImmune·**aggroUp·taunt**(어그로) … (필요 시 추가)
; 타겟 = 가중 추첨: 피격가중 = 敵対心 × 성격보정. target 규칙(lowHp/weakpoint/threat/protectMaster/random) = 성격 보정 배율로 작동
```
- **priority**(override 충돌): `변용종착 > 합성성격 > 성격`.
- 스택: stat=누적 / weight=합산 / override=우선순위 / special=독립.

---

## 5. 콘텐츠 테이블 (데이터 파일)

| 파일 | 내용 |
|---|---|
| traits.json | 트레잇 정의(§1) — CT/PT/AT/BT |
| traitSynthesis.json | 합성 레시피 (재료 트레잇 → 결과) |
| variationRoutes.json | 루트·칸·시그니처·침염 임계 (4루트×4칸) |
| contradictionPairs.json | 모순쌍 → 통합/분열 결과 (AT/PT/BT) |
| partSignatures.json | 부위 → 시그니처 트레잇·조교완료 임계 (6+1) |

---

## 6. 런타임 유닛 상태 (per-unit, 세이브 대상)

- **고(固)**: 경험치(→HP), 침염 카운트(종류별), 변용도(루트별).
- **휘(揮)**: 휘기(sub카테고리별, 소비).
- **역가(力)**: 숙련/내성(부위별), 공격숙련(속성별) — 레벨.
- **지식(知)**: 지식.{종류} 레벨(역가형, 행위로 레벨업) — 가공·경영·탐사·시설 게이팅. 적성 트레잇이 레벨업 속도 보정.
- **상태**: 감도(부위별 0~100), 글로벌5(0~100), 호감도, 보조 PALAM.
- **장비 파생**: 공/방/속도, defense 7슬롯.
- 보유 트레잇 목록(id) + 부위 조교완료 플래그.

---

## 7. 리졸브 파이프라인 (엔진)

1. **조교 1회**: 도구(기법 출력) × (감도/100) × (1+숙련보정) → 쾌감. 누적 ≥ 절정임계(내성이 올림) → 절정. effects(gainMult 등) 적용 → 글로벌5 변동. 절정 세션 → 침염+1(최강 상승 종류) → 변용도 갱신 → 시그니처 트레잇 부여.
2. **전투 라운드**: bridges 수집(when 평가) → ①override(priority) → ②weight 합산 추첨 → ③AP 맞는 스킬(역가 우선) → ④stat 누적 보정 → ⑤target rule. special 독립 적용.
3. **합성**: 보유 트레잇이 레시피/모순쌍 조건 충족 → 결과 트레잇 발현.

---

## 8. 확장성 결론

- 변용·침염·도·모순쌍·名器·다리·합성·효과 = **전부 데이터 테이블** → 콘텐츠 = JSON 행 추가.
- 엔진 = §2~4 어휘를 아는 파서/리졸버 하나.
- **새 효과 종류 등장 시에만** op/target/bridge type 어휘 1개 추가(드문 코드 터치).
- 우리가 몰드를 전부 "표"로 잡아온 것이 그대로 데이터 스키마가 됨 → 확장성 OK.

### 미확정
- [ ] 어휘 최종 확정(op/target/condition/bridge 풀 목록).
- [ ] 보조 PALAM(윤활·욕정·고통) 채택 범위.
- [x] 역가 공격숙련 단위 = **속성별 7**(물리+6원소) 확정. 부위6↔속성7 대칭.
- [ ] 세이브 스키마 버전닝.
