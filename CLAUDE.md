# Claude Code 작업 가이드

이 파일은 Claude Code가 이 프로젝트를 작업할 때 자동으로 읽는 컨텍스트입니다.

---

## 프로젝트 개요

- **장르**: 가문 중심 대전략 시뮬레이션 (CK3 + HOI4 + Victoria3 스타일)
- **현재 스택**: HTML Canvas + Vanilla JavaScript (단일 파일)
- **목표 스택**: Unity C# (프로토타입 완성 후 포팅)
- **주요 파일**: `index.html` (모든 게임 코드 인라인), `editor.html` (맵 에디터), `progress.html` (진척도)

---

## 코드 규칙

### 파일 구조
- `index.html` — 게임 전체 코드가 하나의 HTML에 인라인. 분리 금지 (브라우저 직접 실행 목적).
- `src/modules/*.js` — 참조/포팅용 분리 소스. 실제 게임 실행에 사용되지 않음.
- `docs/` — 설계 문서. 코드 변경 시 영향받는 MD도 업데이트.

### JavaScript 스타일
```javascript
// ✅ IIFE 모듈 패턴 사용
const ModuleName = (() => {
  // private: 소문자 시작 또는 _언더스코어
  function _privateHelper() { ... }

  // public: 소문자 시작 camelCase
  function publicMethod() { ... }

  return { publicMethod };
})();

// ✅ "use strict" 모든 모듈에 필수
"use strict";

// ✅ JSDoc 공개 API에 필수
/** @returns {Province|null} */
function getById(id) { ... }
```

### 네이밍
- 모듈: `PascalCase` (예: `GameCore`, `ProvinceManager`)
- 내부 함수: `_camelCase` (언더스코어 접두사 = private)
- 상수: `UPPER_SNAKE_CASE`
- DOM ID: `kebab-case`
- CSS 클래스: `kebab-case`

---

## 현재 구현 상태 (Phase 2/6 완료)

### 완료 모듈
| 파일 위치 | 모듈 | 주요 기능 |
|-----------|------|----------|
| `index.html` > `GameCore` | M01 | 날짜, 배속, 이벤트버스 |
| `index.html` > `ProvinceManager` | M03 | 18프로빈스, 5세력, 8지형 데이터 |
| `index.html` > `MapRenderer` | M02 | 캔버스 렌더, 색상피킹, 줌/패닝 |
| `index.html` > `FactionManager` | M04 | 금화/위신/안정도, 관계도, 월경제틱 |
| `index.html` > `CharacterManager` | M05 | 캐릭터, 12특성, 계승, 혼인 |
| `index.html` > `TimeBar` | — | 월별 타임바 UI |
| `index.html` > `Notifications` | — | 인게임 알림 피드 |
| `index.html` > `UI` | — | 사이드패널 (3탭) |

### 다음 작업 (Phase 3)
1. **M06** 병력/사단 시스템
   - 세력별 주둔군 배치
   - 병종 (보병/기병/궁병/공성)
   - 사단 편성 및 맵 이동
2. **M07** 전투 계산 엔진
   - 전투력 = 병력 × 병종계수 × 지형보정 × 군주무력보정
   - 손실 계산, 퇴각

---

## 이벤트버스 사용법

```javascript
// 리스너 등록 (모듈 초기화 시)
GameCore.on('tick',     state  => { /* 매일 호출 */ });
GameCore.on('newMonth', state  => { /* 매월 호출 */ });
GameCore.on('newYear',  state  => { /* 매년 호출 */ });

// 커스텀 이벤트 발생
GameCore.emit('battleStart', { attackerId: 'a', defenderId: 'b' });
```

---

## 작업 시 주의사항

### 절대 하지 말 것
- `index.html`을 여러 파일로 분리하지 말 것 (브라우저 CORS 문제)
- `ProvinceManager`의 `PROVINCES_DATA`를 직접 수정하지 말 것 → `editor.html` 사용
- 모듈 간 순환 의존성 추가 금지 (`docs/ARCHITECTURE.md` 의존성 그래프 참조)

### 새 모듈 추가 시 체크리스트
1. `index.html`의 `<script>` 블록에 IIFE 패턴으로 추가
2. `src/modules/M##_ModuleName.js`에 동일 코드 분리 저장
3. `docs/modules/M##_ModuleName.md`에 스펙 문서 작성
4. `progress.html`의 해당 모듈 카드 상태 업데이트 (`status-pending` → `status-done`)
5. `window.addEventListener('load')` 핸들러에 초기화 코드 추가
6. `docs/ARCHITECTURE.md` 의존성 그래프 업데이트

### 경제 수치 변경 시
`src/modules/M04_FactionManager.js`의 상수 섹션 수정:
```javascript
const BASE_INCOME_PER_DEV  = 8;   // 개발도 1당 금화/월
const EXPENSE_PER_PROVINCE = 12;  // 프로빈스 유지비/월
const BUILDING_INCOME = { ... };  // 건물별 수입
```

---

## 자주 쓰는 API 스니펫

```javascript
// 특정 프로빈스 가져오기
const p = ProvinceManager.getById(6); // 한성

// 세력 소속 프로빈스 목록
const koreaProvs = ProvinceManager.getFactionProvinces('고려');

// 세력 자원 상태
const state = FactionManager.getFactionState('고려');
// { gold, prestige, stability, income, expenses }

// 두 세력 관계도 조회
const rel = FactionManager.getRelation('고려', '남방'); // -100~100

// 관계도 변경
FactionManager.modRelation('고려', '남방', +20); // 우호 증가

// 군주 캐릭터
const ruler = CharacterManager.getRuler('고려');
const stats = CharacterManager.getEffectiveStats(ruler); // 특성 보정 적용

// 알림 발생
Notifications.push('사건 발생!', 'warn'); // '', 'warn', 'alert', 'good'

// 이벤트 버스
GameCore.emit('customEvent', { data: 'value' });
GameCore.on('customEvent', data => console.log(data));
```

---

## 테스트 방법

별도 테스트 프레임워크 없음. 브라우저 콘솔에서 직접 확인:

```javascript
// 콘솔에서 즉시 테스트
GameCore.togglePause();
ProvinceManager.getAll().length;           // 18
FactionManager.onMonthTick();              // 수동 월 틱
CharacterManager.onYearTick();             // 수동 연 틱
CharacterManager.marry(1, 5);              // 캐릭터 혼인
FactionManager.modRelation('고려','남방', -50); // 관계 악화
```
