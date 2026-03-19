# EraElectron 엔진 v4.7.1 분석 리포트

> 분석 대상: C:\Users\kdsk\Desktop\era-electron-4.7.1
> 유형: ERA 게임 엔진 소스코드 (게임이 아님)
> 라이선스: GPL 2.0
> 참고 방식: 설계 사상/패턴만 참고, 코드 복사 없음

---

## 1. 개요

EraElectron은 텍스트 기반 시뮬레이션(ERA) 게임을 JS로 개발하기 위한 **전용 엔진**.
Vue 3 + Element Plus로 렌더링, Electron으로 데스크탑 앱화.

| 항목 | 내용 |
|------|------|
| 기반 | Electron 34 + Vue 3 + Element Plus |
| 언어 | JavaScript (TypeScript 미사용, JSDoc으로 타입) |
| UI | Vue 컴포넌트 (24칼럼 그리드) |
| 차트 | Chart.js 내장 |
| 빌드 | Vue CLI + Electron Builder |
| 스크립트 | Kojo 포맷 (커스텀 JS 래퍼) |

---

## 2. 아키텍처 레이어

```
┌─────────────────────────────────────┐
│  게임 스크립트 (main.js)            │  ← 게임 개발자가 작성
│  era.print(), era.input() 호출      │
├─────────────────────────────────────┤
│  EraApi (era-api.js)                │  ← 게임용 API 파사드
│  캐릭터/데이터/표시/입력/세이브      │
├─────────────────────────────────────┤
│  Era Core (era-class.js)            │  ← 상태 관리 컨테이너
│  config, data, static, global       │
├─────────────────────────────────────┤
│  IPC Bridge (preload.js)            │  ← 보안 격리
│  contextBridge로 안전한 통신         │
├─────────────────────────────────────┤
│  Main Process (background.js)       │  ← Electron 윈도우/파일
│  BrowserWindow, 프로토콜, 파일I/O    │
├─────────────────────────────────────┤
│  Renderer (Vue 3 + Element Plus)    │  ← 화면 렌더링
│  PrintBlock, ButtonBlock, Progress   │
└─────────────────────────────────────┘
```

---

## 3. 핵심 설계 패턴

### 3-1. 변수 경로 표기법

```
era.get('base:캐릭터ID:필드명')
era.set('flag:플래그명', 값)
era.add('palam:캐릭터ID:쾌C', 50)
```

장점: 문자열 하나로 중첩 데이터 접근. 코드가 선언적.
우리와 비교: `engine.state.player.hp` (직접 접근) vs `era.get('base:0:hp')` (경로 접근)

### 3-2. 라인 타입 다형성

렌더러가 `line.type`으로 분기:

| type | 렌더링 |
|------|--------|
| 1 | 버튼 (클릭 가능, 단축키) |
| 2 | 구분선 |
| 4 | 이미지 (스프라이트) |
| 5 | 전체 이미지 |
| 7 | 다중 칼럼 |
| 8 | 행열 그리드 |
| 9 | 프로그레스바 |
| 10 | 텍스트 |

우리와 비교: 우리는 `print(text, className)`으로 단일 타입. 타입별 분기가 없음.

### 3-3. Promise 기반 입력

```
const result = await era.input({type: 'number', min: 0, max: 10});
```

게임 스크립트가 async/await로 흐름 제어.
우리와 비교: 우리는 이벤트 핸들러 + currentScreen FSM. 동기적.

### 3-4. 24칼럼 그리드 (Element Plus el-row/el-col)

```
era.printInColRows(
  { columns: [...], config: { width: 8 } },   // 8/24 = 33%
  { columns: [...], config: { width: 16 } }    // 16/24 = 67%
)
```

Element Plus의 `el-col :span="8"` 활용.
우리와 비교: 우리는 `<div>` + 수동 배치. CSS grid로 비슷하게 가능.

### 3-5. 모듈 샌드박스

게임 스크립트가 Node.js API에 직접 접근 못하게 `require()` 가로채기.
우리와 비교: 우리는 nodeIntegration:true라 샌드박스 없음 (알파라 괜찮음).

---

## 4. 렌더러 컴포넌트 구조

```
App.vue (루트)
  ├─ 스크롤 영역 (lines 배열 렌더링)
  │   └─ PrintBlock.vue (라인 타입별 분기)
  │       ├─ TextBlock.vue (텍스트 + 스타일)
  │       ├─ ButtonBlock.vue (버튼 + 배지)
  │       ├─ 구분선
  │       ├─ 이미지 (스프라이트/전체)
  │       ├─ 프로그레스바
  │       └─ 다중 칼럼 (el-row/el-col)
  ├─ 입력 영역
  ├─ 설정 다이얼로그
  └─ 저작권 다이얼로그
```

### 렌더링 흐름

```
게임: era.print('텍스트')
  → EraApi.print() → IPC 전송
  → background.js → renderer
  → App.vue: lines.push({type:10, content:'텍스트'})
  → Vue 반응형 → PrintBlock 렌더링
```

---

## 5. 데이터 관리 구조

### 내장 테이블 (모든 게임 공통)

```
abl, base, maxbase, cflag, cstr, equip, ex, nowex, exp,
flag, global, item, mark, palam, juel, gotjuel, stain,
talent, tcvar, tequip, tflag, source, delta
```

### 데이터 종류

| 종류 | 설명 | 지속성 |
|------|------|--------|
| static | CSV에서 로드한 정의 데이터 | 읽기 전용 |
| data | 게임 중 변하는 동적 상태 | 세이브 대상 |
| global | 플레이 간 유지 (업적 등) | 별도 저장 |
| config | 엔진/윈도우 설정 | electron-store |

### 세이브 시스템

- 슬롯 기반 (인덱스 번호)
- 선택적 gzip 압축
- data + global 분리 저장
- 코멘트(설명) 첨부 가능

---

## 6. 훈련(조교) 모드 지원

엔진 레벨에서 훈련 모드 전용 기능:

```
era.addCharacterForTrain(id)  — 훈련 대상 등록
era.beginTrain(id)            — 훈련 시작 (delta 테이블 초기화)
era.nextTurnInTrain()         — 턴 진행 (delta 누적)
era.endTrain()                — 훈련 종료 (delta를 base에 반영)
```

delta 패턴: 훈련 중 변화량을 별도 테이블에 쌓고, 종료 시 일괄 반영.
→ 취소/되돌리기가 가능한 구조.

---

## 7. 리소스 관리

### 커스텀 프로토콜

```
eeip://이미지경로  → 이미지 로드
emip://오디오경로  → 오디오 로드
```

Electron의 protocol.registerFileProtocol로 구현.
게임 폴더 내 리소스를 URL처럼 접근.

### 이미지 메타데이터

```javascript
EraResource {
  path: string,
  x: number, y: number,     // 스프라이트 시트 내 위치
  width: number, height: number,
  posX: number, posY: number  // 화면 배치 위치
}
```

---

## 8. 빌드 & 배포

- **개발**: `npm run electron:serve` (핫 리로드)
- **배포**: `npm run local:build` (로컬 실행용)
- **패키징**: electron-builder (Windows/Mac/Linux)
- **게임 분리**: 엔진과 게임을 별도 배포, 엔진이 게임 폴더를 로드

---

## 9. 우리 프로젝트에 참고할 설계 사상

### 즉시 적용 가능 (코드 독자 구현)

| EraElectron 사상 | 우리 독자 구현 방향 |
|----------------|-------------------|
| **라인 타입 시스템** | print()에 type 파라미터 추가. text/button/progress/columns/divider |
| **24칼럼 그리드** | CSS `display: grid; grid-template-columns: repeat(24, 1fr)` |
| **프로그레스바 컴포넌트** | `<div class="progress">` + CSS width% |
| **delta 패턴 (훈련)** | 조교 결과를 임시 저장 → 확정 시 반영 (취소 가능) |
| **세이브 압축** | JSON.stringify → pako.gzip (npm pako) |

### 중기 적용

| EraElectron 사상 | 우리 독자 구현 방향 |
|----------------|-------------------|
| **Promise 입력** | `await waitInput()` 패턴 (현재 FSM → async/await 전환) |
| **변수 경로 표기** | `engine.get('player.hp')` 헬퍼 (선택적) |
| **이벤트 IPC 분리** | 게임 로직과 렌더링 분리 (현재는 app.js에 혼재) |

### 장기 / 참고만

| EraElectron 사상 | 비고 |
|----------------|------|
| Vue 3 전환 | 현재 바닐라 DOM으로 충분. 규모 커지면 검토 |
| 모듈 샌드박스 | 싱글 개발자라 불필요 |
| 커스텀 프로토콜 | 이미지 지원 시 검토 |
| Kojo 스크립트 | 자체 스크립트 언어 불필요 |

---

## 10. 좋은 결정 / 아쉬운 점

### 잘한 것
1. **Vue + Element Plus** — 컴포넌트 재사용, 반응형 렌더링
2. **IPC 격리** — 보안 모범 사례
3. **경로 기반 변수 접근** — 깔끔한 API
4. **코드 생성** — 타입 안전 헬퍼 자동 생성
5. **Promise 입력** — 게임 흐름이 자연스러움

### 아쉬운 것
1. **TypeScript 미사용** — JSDoc만으로는 한계
2. **모듈 샌드박스 복잡** — require 가로채기는 깨지기 쉬움
3. **Era 클래스 비대** — 더 분리 가능
4. **에러 복구 부족** — 스크립트 에러 시 세션 크래시

---

## 11. 결론

EraElectron은 **텍스트 게임 엔진으로서 매우 잘 설계**되어 있음.
특히 **라인 타입 다형성**, **24칼럼 그리드**, **Promise 입력**, **delta 패턴**은
우리 프로젝트에서 독자적으로 구현할 가치가 있는 설계 사상.

GPL 라이선스 때문에 코드를 가져올 수는 없지만,
"이런 기능이 필요하고, 이런 접근이 효과적이다"라는 **방향성**은 충분히 참고 가능.
