# ERA Uma (엔진 동봉판 v2.21) 분석 리포트

> 분석 대상: C:\Users\kdsk\Desktop\erauma-with-engine-2.21-win-x64
> 장르: 우마무스메 ERA (EraElectron 기반)
> 엔진: EraElectron v4.7.0+
> 게임 버전: v2.210 (agito, 2026.02.05)

---

## 1. 개요

EraUmaK와 **같은 EraElectron 엔진**이지만 더 최신 버전 (v4.7.0+).
중국어 기반이지만 코드는 **전부 JavaScript**. 전통 ERA의 ERB 없이 순수 JS로 작성.

- 실행파일: `ERA-Electron - 重量级ERA引擎.exe`
- 소스코드: `/game/ere/` (JS 모듈)
- 게임 데이터: `/game/csv/` (CSV + JSON)
- 세이브: `/game/sav/`
- 윈도우: 1000×916

---

## 2. EraUmaK와의 비교

| 항목 | EraUmaK | EraUma Engine 2.21 |
|------|---------|-------------------|
| 엔진 버전 | v3.3.2+ | **v4.7.0+** (최신) |
| 언어 | 중국어/한국어 혼합 | 중국어 주, 한국어 번역 |
| 규모 | 2,256 JS 파일 | 더 많음 (추정) |
| 특수 시스템 | 레이스/트레이닝 | + **지하실(감금)**, **임신**, **NTR** |
| 캐릭터 확장 | 고정 ID | **자녀 = 동적 ID 생성** |
| 세이브 | 일반 | **압축 세이브 지원** |
| 리소스 | 내장 | **분리 패키지** (게임/리소스/엔진 별도) |

---

## 3. 프로젝트 구조

```
game/
├── ere/                         # 게임 로직 (JavaScript)
│   ├── main.js                  # 엔트리 포인트
│   ├── era-electron.js          # 엔진 API 래퍼
│   ├── versions.js              # 버전 관리
│   ├── data/                    # 상수/데이터
│   │   ├── const.json           # 색상, 트레이너 급여 등
│   │   ├── attr-score.json      # 속성 점수
│   │   ├── chara-*.js           # 캐릭터 유전자/스킬/칭호
│   │   ├── ero/                 # 성인 콘텐츠 상수
│   │   └── event/               # 이벤트 데이터
│   ├── event/                   # 이벤트 시스템
│   │   ├── edu/                 # 교육/훈련 (edu-0 ~ edu-306+)
│   │   ├── ero/                 # 성인 이벤트
│   │   ├── daily/               # 일상 이벤트
│   │   ├── check/               # 조건 체크
│   │   ├── basement/            # 지하실(감금) 시스템
│   │   ├── queue.js             # 이벤트 큐
│   │   └── *-factory.js         # 팩토리 패턴
│   ├── page/                    # UI 화면
│   │   ├── page-homepage.js     # 메인 허브
│   │   ├── page-train.js        # 훈련 화면
│   │   ├── page-race.js         # 레이스
│   │   ├── page-ero.js          # 성인 화면
│   │   ├── page-new-game.js     # 새 게임
│   │   ├── page-save-game.js    # 세이브/로드
│   │   └── components/          # 재사용 컴포넌트
│   ├── system/                  # 게임 시스템
│   │   ├── sys-init-chara.js    # 캐릭터 초기화
│   │   ├── sys-next-week.js     # 시간 진행
│   │   ├── sys-train-uma.js     # 훈련 계산
│   │   ├── sys-calc-*.js        # 스탯 계산
│   │   ├── chara/               # 캐릭터 (상속/부정/상태)
│   │   ├── ero/                 # 성인 계산 (임신/쾌락/노예)
│   │   ├── race/                # 레이스 메카닉
│   │   ├── basement/            # 감금 메카닉
│   │   └── global/              # 업적/보상
│   └── utils/                   # 유틸리티
├── csv/                         # 게임 데이터
│   ├── Chara/                   # 캐릭터별 CSV (Chara####.csv)
│   ├── Param.csv                # 쾌락 9종 + 감정 6종 + 상속
│   ├── Status.csv               # 상태효과 85+종
│   ├── Skill.csv                # 스킬
│   ├── Talent.csv               # 재능
│   ├── Base.csv                 # 기본 스탯
│   ├── Flag.csv / CFlag.csv     # 플래그
│   ├── Exp.csv                  # 경험치
│   ├── Item.csv / Equip.csv     # 아이템/장비
│   ├── _config.json             # 게임 설정
│   └── _fixed.json              # 고정 데이터
└── ere.config.json              # 엔진 설정
```

---

## 4. 엔진 API (v4.7.0)

EraUmaK의 v3.3.2와 동일 기반이지만 확장됨:

### 렌더링

| 메서드 | 역할 |
|--------|------|
| `print(content, config)` | 텍스트 출력 |
| `println(content, config)` | 줄바꿈 텍스트 |
| `printButton(content, key, config)` | 클릭 버튼 |
| `printProgress(%, in, out, config)` | 프로그레스바 |
| `printMultiColumns(cols, config)` | 복수 열 |
| `printInColRows(...)` | 행열 그리드 |
| `replaceInColRows(...)` | 기존 행열 교체 (부분 갱신) |
| `drawLine(config)` | 구분선 |
| `clear(count)` | 화면 클리어 |

### 상태 관리

| 메서드 | 역할 |
|--------|------|
| `get(path)` | 변수 읽기 (`'base:0:체력'`) |
| `set(path, value)` | 변수 쓰기 |
| `add(path, delta)` | 변수 증감 |
| `addCharacter(id)` | 캐릭터 등록 |
| `getAddedCharacters()` | 등록된 캐릭터 목록 |

### 입력

| 메서드 | 역할 |
|--------|------|
| `input(config)` | 사용자 입력 대기 |
| `waitAnyKey()` | 아무 키 대기 |

### 세이브

| 메서드 | 역할 |
|--------|------|
| `saveData(slot, comment)` | 슬롯 저장 |
| `loadData(slot)` | 슬롯 불러오기 |
| `saveGlobal()` | 글로벌 저장 |
| `loadGlobal()` | 글로벌 불러오기 |

---

## 5. 이벤트 시스템 (Factory + Queue)

### 팩토리 패턴

```javascript
// edu-factory.js — 번호별 훈련 이벤트 동적 로드
const edu_dict = {};
edu_dict[0] = require('#/event/edu/edu-0');
edu_dict[1] = require('#/event/edu/edu-1');
// ...300개+

function get_edu_event(id) {
  return edu_dict[id] || default_edu;
}
```

### 이벤트 큐

```javascript
// queue.js
const queue = [];
queue.push({ type: 'daily', chara: 3, event: 'birthday' });
queue.push({ type: 'check', condition: 'pregnancy_test' });
// 순차 처리
while (queue.length > 0) {
  await process(queue.shift());
}
```

### 이벤트 훅

```javascript
hooks = {
  week_end: [handler1, handler2],
  before_race: [raceCheck],
  good_night: [sleepEvent],
  morning: [wakeupEvent]
}
```

---

## 6. 특수 시스템들

### 지하실(감금) 시스템

```
/system/basement/     — 감금 메카닉
/event/basement/      — 감금 이벤트
/event/basement-queue.js — 감금 전용 이벤트 큐
/data/event/basement-owners.js — 소유자 데이터
```

감금 상태의 캐릭터는 별도 시스템으로 관리.
탈출 시도, 조교 진행, 상태 변화가 독립적으로 돌아감.

### 임신/상속 시스템

```
/system/chara/inherit.js  — 유전자 상속
/system/ero/pregnancy.js  — 임신 계산
/data/chara-genes.js      — 유전자 데이터
```

- 자녀 캐릭터가 **동적으로 생성** (부모의 유전자 조합)
- 자녀 ID = 부모 ID + 오프셋
- 스탯/특성/외형이 유전

### NTR/관계 시스템

```
/system/chara/cheating.js — 부정 행위
/system/ero/slavery.js    — 노예화
```

관계 변화에 따른 복잡한 상태 변화 추적.

---

## 7. CSV 데이터 구조

### Param.csv (쾌락 + 감정)

```csv
; 쾌락 파라미터 (9종)
0, 쾌C
1, 쾌V
2, 쾌A
3, 쾌B
4, 쾌M
5, 쾌E
6, 쾌O    ; (확장)
7, 쾌T    ; (확장)
8, 쾌P    ; (확장)

; 감정 파라미터 (6종)
10, 공순
11, 욕정
12, 굴복
15, 고통
16, 공포
20, 호의
30, 반감
```

### Status.csv (상태효과 85+종)

다양한 일시 상태: 발정, 수면, 속박, 약물 영향, 임신 단계 등.

### 캐릭터 CSV (Chara####.csv)

```csv
; 기본 정보
이름, 스페셜위크
성별, 여
종족, 우마무스메
; 스탯
체력, 100
속도, 85
근성, 70
; 특성
재능:1, 속도형
재능:2, 연습상수
```

---

## 8. 설정 파일

### ere.config.json

```json
{
  "system": {
    "hideUserInput": false,
    "saveCompressedData": true,
    "static": "csv"
  },
  "window": {
    "width": 1000,
    "height": 916,
    "fontSize": 16,
    "audio": 0,
    "autoMax": false
  }
}
```

---

## 9. 우리 프로젝트에 참고할 점

### 아키텍처

| EraUma 방식 | 우리 적용 가능성 |
|------------|----------------|
| Factory 패턴 (300+ 이벤트) | 49체 유닛별 이벤트 모듈화 |
| 이벤트 큐 | 이머전트 이벤트 순차 처리 |
| 동적 캐릭터 생성 | 합체 결과 유닛 |
| 상속 시스템 | 트레잇 잠재력 계승 |
| replaceInColRows (부분 갱신) | 조교 화면 스탯만 갱신 |

### UI

| EraUma 방식 | 우리 적용 |
|------------|----------|
| 24칼럼 그리드 | CSS grid/flexbox로 구현 |
| printProgress | CSS 프로그레스바 |
| printButton + 단축키 | printOption + setActions |
| 부분 화면 갱신 | innerHTML 부분 교체 |

### 데이터

| EraUma 방식 | 비고 |
|------------|------|
| CSV로 캐릭터 정의 | 우리는 JSON (유지) |
| 85+ 상태효과 | 향후 상태이상 시스템 참고 |
| 9종 쾌락 파라미터 | 우리는 6부위 감도 (유지) |

---

## 10. EraElectron 엔진 자체에 대한 메모

- **오픈소스**: gitgud.io에서 배포
- **멀티플랫폼**: Windows, macOS, Linux, Android
- **번들링**: 엔진은 Electron 래퍼, 게임 로직은 JS
- **독립 배포**: 엔진과 게임을 분리 배포 가능
- **API 안정성**: v3→v4로 API 대부분 유지, 확장만 추가

### 우리가 EraElectron을 쓰지 않는 이유

1. **의존성**: 외부 엔진에 의존하면 커스터마이징 제한
2. **커스텀 UI**: 우리는 HTML/CSS로 자유로운 UI 가능
3. **학습 곡선**: 전용 API 학습 필요
4. **우리 프로젝트는 이미 동작 중**: 기존 구조 유지가 효율적

대신 **설계 패턴과 데이터 구조**는 적극 참고.
