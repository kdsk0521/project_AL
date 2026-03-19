# EraUmaK 분석 리포트

> 분석 대상: C:\Users\kdsk\Desktop\EraUmaK
> 장르: 우마무스메 ERA (Electron 기반)
> 엔진: EraElectron v3.3.2+

---

## 1. 개요

EraUmaK는 **EraElectron**이라는 전용 ERA 엔진 위에서 동작하는 우마무스메 팬게임.
일반 Electron 앱이 아니라, ERA 게임 개발을 위해 만들어진 별도 프레임워크를 사용함.

- 소스코드: ~18MB (2,256 JS 파일)
- 윈도우: 1000×916, 16px 기본 폰트
- 데이터: CSV(캐릭터/스킬/장비) + JSON(상수/색상)
- 번들링: ASAR (webpack 추정)

---

## 2. EraElectron 엔진 API

일반 HTML/CSS 대신 **엔진 전용 렌더링 API**를 사용.

### 주요 메서드

| 메서드 | 역할 | 예시 |
|--------|------|------|
| `era.print(content, config)` | 텍스트 출력 (색상/폰트/정렬) | `era.print([{content:'이름', color:'#ff69b4'}])` |
| `era.printButton(content, key, config)` | 클릭 가능한 버튼 | `era.printButton('훈련', 1, {color:'green'})` |
| `era.printProgress(%, in, out, config)` | 프로그레스바 | 체력/경험치 바 |
| `era.printImage(names)` | 이미지 표시 | 캐릭터 반신상 |
| `era.printInColRows(...)` | 다중 열 레이아웃 | 상태+이미지+스탯 병렬 |
| `era.printMultiColumns(cols, config)` | 유연한 열 배치 | 정보 그리드 |
| `era.printLineChart(config)` | Chart.js 차트 | 통계 그래프 |
| `era.drawLine(config)` | 구분선 | 섹션 분리 |
| `era.clear(count)` | 화면 클리어 | 새 화면 표시 |
| `era.input(config)` | 사용자 입력 대기 | 번호 선택, 텍스트 입력 |

### 칼럼 레이아웃 시스템

```javascript
era.printInColRows(
  {
    columns: [{ content: '이름: 스페셜위크', type: 'text' }],
    config: { width: 18 }
  },
  {
    columns: [{ names: 'chara_01_반신', type: 'image.whole' }],
    config: { width: 3 }
  },
  {
    columns: [
      { content: '체력', type: 'text', config: { width: 2 } },
      { percentage: 75, inContent: '75/100', type: 'progress',
        config: { color: '#006800', width: 12 } }
    ],
    config: { width: 15 }
  }
);
```

- width: 1~24 단위 (24 = 전체 너비)
- horizontalAlign / verticalAlign: 정렬
- gutter: 열 간 간격
- type: text / image / progress / divider / button

### 상태 관리 (get/set 패턴)

```javascript
era.get('base:0:체력')       // 캐릭터 0의 체력
era.get('flag:현재년')       // 글로벌 플래그
era.get('cflag:3:의욕')      // 캐릭터 3의 의욕
era.set('base:0:체력', 100)  // 값 설정
era.add('base:0:체력', -10)  // 값 증감
```

스코프 종류:
- `base`: 수치 스탯 (체력, 정력, 기력)
- `cflag`: 캐릭터 플래그 (모집, 성장단계)
- `flag`: 글로벌 플래그 (년도, 위치, 돈)
- `status`: 일시 상태효과
- `talent`: 선천 능력/특성
- `static`: CSV에서 불러온 고정 데이터

---

## 3. 프로젝트 구조

```
EraUmaK/
├── game/
│   ├── ere/                    # 소스코드 (18MB)
│   │   ├── main.js             # 엔트리 포인트 (720줄)
│   │   ├── era-electron.js     # 엔진 API JSDoc (512줄)
│   │   ├── data/               # 상수, 색상, 위치
│   │   ├── event/              # 이벤트 시스템
│   │   │   ├── rec/            # 모집 이벤트 (캐릭터별 파일)
│   │   │   ├── daily/          # 일상 이벤트
│   │   │   ├── edu/            # 교육 이벤트
│   │   │   ├── ero/            # 성인 이벤트
│   │   │   ├── queue.js        # 이벤트 큐
│   │   │   └── *-factory.js    # 팩토리 패턴
│   │   ├── page/               # UI 페이지
│   │   │   ├── components/     # 재사용 UI 컴포넌트
│   │   │   ├── page-homepage.js
│   │   │   ├── page-header.js
│   │   │   └── ...
│   │   ├── system/             # 게임 시스템
│   │   │   ├── sys-calc-*.js   # 스탯 계산
│   │   │   ├── sys-filter-*.js # 조건 필터링
│   │   │   ├── sys-init-*.js   # 초기화
│   │   │   └── sys-next-week.js # 시간 진행
│   │   └── utils/              # 유틸리티
│   ├── csv/                    # 게임 데이터
│   │   ├── Base.csv            # 기본 스탯 정의
│   │   ├── Palam.csv           # 쾌락 파라미터
│   │   ├── Skill.csv           # 스킬 정의
│   │   ├── Status.csv          # 상태효과
│   │   └── GameBase.csv        # 게임 메타데이터
│   └── resources/app.asar      # 패키징된 Electron 앱
└── resources/                   # 에셋 (이미지, 오디오)
```

---

## 4. 게임 루프 구조

```
main.js (엔트리)
  └─→ homepage() [page-homepage.js]
       ├─→ 새 게임 → 초기화 → 메인 루프
       ├─→ 불러오기 → 세이브 로드
       └─→ 업적/힌트

메인 루프:
  ├─→ page_header()        # 상단 상태바 (날짜/위치/돈/레이스)
  ├─→ cur_chara_component() # 캐릭터 상세 (이미지+스탯)
  ├─→ 행동 선택             # 훈련/교류/레이스 등
  ├─→ 이벤트 처리           # factory → queue → 실행
  ├─→ sys_next_week()       # 시간 진행, 주간 계산
  └─→ 반복
```

---

## 5. 이벤트 시스템

### Factory 패턴

```javascript
// event/rec/rec-factory.js
cons_dict[3] = require('#/event/rec/rec-3');  // 캐릭터 3 전용
cons_dict[7] = require('#/event/rec/rec-7');  // 캐릭터 7 전용

function get_chara_talk(chara_id) {
  return cons_dict[chara_id] || default_talk;
}
```

- 캐릭터별 이벤트를 **별도 파일**로 분리
- Factory가 ID로 해당 모듈을 로드
- 기본 이벤트 fallback 존재

### 이벤트 훅

```javascript
event_hooks = {
  week_end: 'hook_name',
  good_night: 'hook_name',
  before_race: 'hook_name'
}
```

시스템이 특정 시점(주말, 취침 전, 레이스 전)에 훅을 트리거.

### 이벤트 큐

```javascript
// queue.js
queue.push(event);      // 이벤트 추가
queue.process();         // 순서대로 처리
```

여러 이벤트가 동시 발생 시 큐에 넣고 순차 처리.

---

## 6. 색상 체계

```json
{
  "attr_colors": {
    "체력": "#7fff00",
    "력량": "#ec8416",
    "근성": "#ff8c00",
    "지혜": "#00bfff",
    "속도": "#40e0d0"
  },
  "relation_colors": {
    "실망": "#ff7373",
    "보통": "#fbfbfb",
    "융화": "#90ee90",
    "신뢰": "#00ff7f"
  },
  "love_colors": {
    "애매": "#ffc0cb",
    "연인": "#ff69b4",
    "가우": "#ff1493"
  }
}
```

속성/관계/연애 단계별 고정 색상 → UI 일관성.

---

## 7. 세이브 시스템

```javascript
await era.saveData(slotIndex, comment)  // 슬롯 저장
await era.loadData(slotIndex)           // 슬롯 불러오기
await era.saveGlobal()                  // 글로벌 변수 저장
await era.loadGlobal()                  // 글로벌 변수 불러오기
```

- 다중 슬롯 지원
- 글로벌 변수 (업적 등)는 세이브와 별도로 유지
- 압축 옵션: `saveCompressedData: true`

---

## 8. 우리 프로젝트에 적용 가능한 것

### 즉시 적용 가능

| 항목 | EraUmaK 방식 | 우리 프로젝트 현재 | 적용 방법 |
|------|-------------|------------------|----------|
| 칼럼 레이아웃 | printInColRows | 단순 print | HTML table/flexbox로 칼럼 구현 |
| 색상 체계 | 속성별 고정 색상 JSON | 클래스 기반 | 태그/원소별 색상 상수 정의 |
| 이벤트 팩토리 | 캐릭터별 모듈 분리 | 인라인 | 유닛별 이벤트 파일 분리 |
| 프로그레스바 | printProgress 내장 | 수동 ████ | CSS 기반 바 컴포넌트 |
| 상태 스코프 | era.get('scope:id:field') | engine.state.xxx | 네이밍 패턴 참고 |

### 중장기 적용

| 항목 | 설명 |
|------|------|
| 이벤트 큐 | 이머전트 이벤트 동시 발생 시 순서 관리 |
| 캐릭터 이미지 | 유닛 일러스트/반신상 표시 |
| Chart.js 통합 | 유닛 성장 그래프, 경제 통계 |
| 이벤트 훅 | 시간/장소/조건별 자동 이벤트 트리거 |

### 적용하지 않을 것

| 항목 | 이유 |
|------|------|
| EraElectron 엔진 | 전용 엔진이라 우리 프로젝트에 맞지 않음 |
| CSV 데이터 | 이미 JSON으로 구축, 전환 불필요 |
| ASAR 패키징 | 알파 단계에서 불필요 |

---

## 9. EraElectron vs 우리 아키텍처 비교

| | EraElectron | 우리 프로젝트 |
|---|------------|-------------|
| 렌더링 | 엔진 전용 API | HTML/CSS + JS DOM 조작 |
| 레이아웃 | 칼럼 그리드 (엔진 내장) | print() + CSS class |
| 입력 | await era.input() | keydown 이벤트 |
| 상태관리 | era.get/set (스코프 패턴) | engine.state (객체 직접) |
| 데이터 | CSV + JSON | JSON only |
| 이벤트 | Factory + Queue | 인라인 + 조건분기 |
| 세이브 | 엔진 내장 (다중슬롯) | localStorage (3슬롯) |
| 이미지 | 엔진 내장 지원 | 미지원 (텍스트 only) |

---

## 10. 결론

EraUmaK는 **EraElectron 전용 엔진**이라는 특수한 기반 위에 있어서 코드를 직접 가져올 수는 없지만,
**설계 패턴과 UI 구성 방식**은 크게 참고할 만함:

1. **칼럼 기반 정보 배치** — 상태바를 1줄씩 나열하지 말고 그리드로
2. **색상 체계 상수화** — 속성/상태별 색상을 JSON으로 관리
3. **Factory 패턴** — 49체 유닛 이벤트를 개별 모듈로 분리
4. **이벤트 큐** — 복수 이벤트 순차 처리
5. **프로그레스바 CSS 컴포넌트화** — 수동 문자열 대신 HTML 엘리먼트로
