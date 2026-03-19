# 베타 전환 로드맵 — ERA 분석 기반 적용 계획

> 참조: analysis_EraOCG2.md, analysis_EraUmaK.md, analysis_EraUma_Engine.md
> 현재 상태: 알파 (동작하는 게임, 전 시스템 구현)
> 목표: 베타 (시스템 안정화 + 콘텐츠 확장 + UI 개선)

---

## 데이터 형식: JSON vs CSV

### 결론: **JSON 유지, 대량 데이터만 CSV 검토**

| 데이터 종류 | 현재 | 베타 | 이유 |
|------------|------|------|------|
| 유닛 정의 (49체+) | JSON | **JSON 유지** | 중첩 구조(트레잇 객체 등) JSON이 자연스러움 |
| 재료/레시피 | JSON | **JSON 유지** | 수량 적음 (50종 미만) |
| 던전 맵 | JSON | **JSON 유지** | 노드 연결 구조가 JSON에 적합 |
| 트레잇 (93종+) | JSON | **JSON 유지** | 객체 필드가 많아 CSV 비효율 |
| 대사/텍스트 풀 | 없음 | **CSV 도입 검토** | 대량 텍스트는 CSV가 편집 용이 (스프레드시트) |
| 이벤트 조건 테이블 | 없음 | **CSV 도입 검토** | 조건 매트릭스는 표 형태가 읽기 쉬움 |
| 밸런스 수치 테이블 | 하드코딩 | **CSV 도입 추천** | 스프레드시트로 밸런싱, 코드 수정 없이 조정 |

**CSV를 쓰면 좋은 곳**: 대량 반복 데이터, 밸런스 수치, 텍스트 풀
**JSON이 나은 곳**: 중첩 구조, 로직 포함 데이터, 소량 데이터

---

## 적용 계획: 우선순위별 정리

### 1단계: UI 개선 (즉시 적용 가능)

EraElectron의 칼럼 레이아웃을 CSS로 구현.

#### 1-1. 칼럼 레이아웃 시스템

```
현재: print()로 한 줄씩 출력
목표: printColumns()로 그리드 배치
```

구현 방법: HTML `<div>` + CSS `display: grid` 또는 `flex`

```javascript
// 새 메서드 추가
printColumns(columns, config) {
  // columns: [{content, width, align, color}]
  // width: 1~24 (24칼럼 그리드)
  const row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = columns.map(c => `${(c.width/24*100).toFixed(1)}%`).join(' ');
  // ...
}
```

적용 대상:
- 조교 화면: 감도 바 + 상태 수치를 좌우 배치
- 유닛 상세: 스탯 + 트레잇을 2열
- 인벤토리: 재료를 3열 그리드
- 전투: 아군/적 상태를 좌우 분할

#### 1-2. CSS 프로그레스바 컴포넌트

```
현재: [████····] 문자열
목표: <div class="progress-bar"> CSS 렌더링
```

```javascript
printProgressBar(label, value, max, color) {
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  bar.innerHTML = `
    <span class="label">${label}</span>
    <div class="bar-bg">
      <div class="bar-fill" style="width:${(value/max*100)}%; background:${color}"></div>
      <span class="bar-text">${value}/${max}</span>
    </div>
  `;
  // ...
}
```

#### 1-3. 색상 체계 상수화

```javascript
// data/colors.json
{
  "elements": { "열":"#ff6b35", "위":"#a0522d", "동":"#4169e1", "광":"#ffd700", "식":"#9932cc" },
  "stats": { "hp":"#ff4444", "stamina":"#44ff44", "soulPower":"#4a9eff" },
  "affection": { "경계":"#ff4444", "인지":"#ff8c00", "친밀":"#ffd700", "신뢰":"#44ff44", "유대":"#4a9eff", "헌신":"#ff69b4" },
  "sensitivity": { "low":"#666", "mid":"#ff8c00", "high":"#ff4444", "max":"#ff69b4" },
  "globalState": { "love":"#ff69b4", "submission":"#9370db", "lewdness":"#ff4444", "fear":"#4a4a4a", "resentment":"#8b0000" }
}
```

---

### 2단계: 이벤트 시스템 (중기)

ERA 3작 공통의 **Factory + Queue** 패턴 도입.

#### 2-1. 이벤트 큐 시스템

```
현재: 이벤트 발생 즉시 처리 (인라인)
목표: 큐에 넣고 순차 처리
```

```javascript
class EventQueue {
  constructor() { this.queue = []; }

  push(event) { this.queue.push(event); }

  async process() {
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      await this.execute(event);
    }
  }

  async execute(event) {
    switch (event.type) {
      case 'milestone': // 마일스톤 달성
      case 'relationship': // 관계 변화
      case 'emergent': // 이머전트 이벤트
      case 'calendar': // 달력 이벤트
    }
  }
}
```

적용 대상:
- 월말 정산 (유지비 + 시설 생산 + 이벤트 동시 발생)
- 던전 귀환 (채집 결과 + 부상 + 관계 변화)
- 합체 결과 (합성 발동 + 잠재력 + 전서 등록)

#### 2-2. 이벤트 Factory 패턴

```
현재: 모든 이벤트가 인라인
목표: 유닛별/상황별 이벤트 모듈 분리
```

```
src/game/events/
  ├── unit/           # 유닛별 이벤트
  │   ├── UNIT_THORN_IMP.js
  │   ├── UNIT_BUBBLE_SLIME.js
  │   └── ...
  ├── calendar/       # 달력 이벤트
  │   ├── month_01.js
  │   └── ...
  ├── emergent/       # 이머전트 이벤트
  │   ├── economy_crisis.js
  │   └── ...
  └── factory.js      # 이벤트 로더
```

#### 2-3. 이벤트 훅 시스템

```javascript
const hooks = {
  'day_end': [],      // 하루 끝
  'month_end': [],    // 월말
  'dungeon_enter': [],// 던전 진입
  'dungeon_return': [],// 던전 귀환
  'unit_ko': [],      // 유닛 기절
  'unit_deliver': [], // 유닛 납품
  'fusion_complete': [],// 합체 완료
  'affection_up': [], // 호감도 단계 상승
  'training_orgasm': [],// 조교 절정
};
```

---

### 3단계: 쾌락 계산 고도화 (중기)

ERA OCG2의 **다중 보정 누적** 시스템 참고.

#### 3-1. 감도 계산에 복합 보정 적용

```
현재: senGain = intensity × ratio × milestone
목표: senGain = intensity × ratio × milestone × 기교보정 × 욕정보정 × 호감보정 × 특성보정
```

```javascript
// 기교 보정: 플레이어 스킬 (향후 추가)
const techBonus = 1.0 + (playerSkill * 0.1);

// 욕정 보정: 음란도에 따라
const lustBonus = gs.lewdness < 20 ? 0.8 : gs.lewdness < 50 ? 1.0 : gs.lewdness < 80 ? 1.4 : 1.6;

// 호감 보정: 호감도가 높을수록 반응
const affBonus = 1.0 + (affStage * 0.1);

// 최종
senGain = Math.floor(baseSen * ratio * milestoneMul * techBonus * lustBonus * affBonus);
```

#### 3-2. 이성(理性) 시스템 도입

```
ERA: 이성이 낮을수록 쾌락 증폭
우리: 음란도가 이성 역할을 일부 하지만, 별도 수치로 분리하면 더 세밀한 제어 가능
```

검토 사항: 음란도와 별개로 "이성" 수치를 추가할지 결정 필요.

#### 3-3. 장비(도구) 패시브 효과

```
현재: 도구 유무만 체크 (hasTrainingTool)
목표: 장착된 도구 종류에 따라 매 턴 패시브 효과
```

```javascript
// 도구별 패시브
const toolPassives = {
  'ITEM_BASIC_ROTOR': { c: +2, v: +1 },    // 매 턴 C+2, V+1
  'ITEM_ADVANCED_VIBE': { v: +3, c: +2 },   // 상위 도구
};
```

---

### 4단계: 콘텐츠 확장 (중장기)

#### 4-1. 대사/텍스트 시스템

```
현재: 하드코딩된 플레이버 텍스트
목표: 외부 파일에서 로드, 유닛별/상황별 대사
```

여기서 **CSV가 유용** — 대사 테이블:

```csv
unit_id, situation, affection_min, text
UNIT_BUBBLE_SLIME, training_start, 0, "...부글부글..."
UNIT_BUBBLE_SLIME, training_start, 35, "...또 하는 거야...?"
UNIT_BUBBLE_SLIME, training_orgasm, 0, "뿌글...!!!"
UNIT_THORN_IMP, training_start, 0, "흥, 또 뭐야?"
```

스프레드시트에서 편집 → CSV 저장 → 게임에서 로드

#### 4-2. 밸런스 수치 CSV

```csv
action_id, name, intensity, unlock_lewdness, unlock_affection, target_mouth, target_chest, target_v, target_c, target_anal, target_skin
1, 머리쓰다듬기, 1, 0, 0, 0, 0, 0, 0, 0, 1.0
7, 키스, 2, 15, 0, 1.0, 0.3, 0, 0, 0, 0
21, V삽입, 4, 55, 3, 0, 0, 2.0, 0.8, 0, 0.3
```

이렇게 하면 밸런싱을 **코드 수정 없이** CSV만 편집해서 조정 가능.

#### 4-3. 유닛별 이벤트 확장

49체 × 호감도 6단계 × 상황별 = 대량 텍스트
→ Factory 패턴 + CSV 텍스트 풀로 관리

---

### 5단계: 16층+ 확장 (장기)

#### 5-1. 던전 그리드 맵

```
현재: 고정 노드 그래프 (72노드)
목표: NxN 그리드 (3×3 → 5×5 확장)
```

#### 5-2. Tier 2 재료 + 새 구역

설계문서에 예약된 분리(分離)/증류(蒸溜) 구역.

#### 5-3. 방문자(패러디) 유닛

`방문자` 태그 시스템 활성화, 동방/기타 원작 캐릭터.

---

## CSV 도입 시 로더 구현 (참고)

필요할 때 간단한 CSV 로더:

```javascript
// utils/csvLoader.js
function loadCSV(filePath) {
  const fs = require('fs');
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith(';'));
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = isNaN(values[i]) ? values[i] : Number(values[i]); });
    return obj;
  });
}
```

사용:
```javascript
const dialogues = loadCSV('data/dialogues.csv');
const balance = loadCSV('data/balance.csv');
```

---

## 요약: 단계별 우선순위

| 단계 | 내용 | 난이도 | ERA 참고 |
|------|------|--------|---------|
| **1** | UI 칼럼 + 프로그레스바 + 색상 | 낮음 | UmaK/Uma 칼럼 시스템 |
| **2** | 이벤트 큐 + Factory + 훅 | 중간 | OCG2/Uma Queue+Factory |
| **3** | 쾌락 복합 보정 + 도구 패시브 | 중간 | OCG2 SOURCE_CALC |
| **4** | 대사 CSV + 밸런스 CSV | 낮음 | Uma CSV 구조 |
| **5** | 던전 그리드 + Tier 2 + 방문자 | 높음 | 자체 설계 |
