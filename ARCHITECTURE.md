# 아키텍처 문서

## 모듈 의존성 그래프

```
GameCore (M01)          ← 최상위, 의존 없음
    │
    ├── ProvinceManager (M03)   ← 데이터 전용, 의존 없음
    │       │
    │       ├── MapRenderer (M02)      ← GameCore + ProvinceManager
    │       ├── FactionManager (M04)   ← ProvinceManager
    │       ├── CharacterManager (M05) ← ProvinceManager + FactionManager
    │       └── UI                    ← ProvinceManager + FactionManager + CharacterManager
    │
    ├── TimeBar                 ← GameCore (tick 이벤트)
    └── Notifications           ← DOM만 사용 (의존 없음)
```

---

## 모듈 로드 순서 (index.html 내 script 순서)

```
1. M01_GameCore       — 이벤트버스 먼저 구축
2. M03_ProvinceManager — 데이터 구조 구축, 인덱스 빌드
3. M02_MapRenderer     — 캔버스 준비 (init은 window.load에서)
4. M04_FactionManager  — ProvinceManager 필요
5. M05_CharacterManager— ProvinceManager + FactionManager 필요
6. Notifications       — DOM 의존만
7. TimeBar             — DOM 의존만
8. UI                  — 모든 Manager 필요
9. window.load 핸들러  — 초기화 순서 보장
```

---

## 이벤트 버스 흐름

```
GameCore.emit('tick')       → TimeBar.update()
                            → MapRenderer.markDirty()

GameCore.emit('newMonth')   → FactionManager.onMonthTick()
                              (수입계산, 안정도, 관계도 드리프트)

GameCore.emit('newYear')    → CharacterManager.onYearTick()
                              (나이++, 사망체크, 계승)
                            → Notifications.push('연도 시작')
```

---

## 핵심 설계 패턴

### 1. IIFE 모듈 패턴
```javascript
const ModuleName = (() => {
  // private 상태
  let privateVar = ...;

  // private 함수
  function _privateHelper() { ... }

  // public API
  function publicMethod() { ... }

  return { publicMethod };
})();
```
- 전역 오염 없음, 각 모듈이 독립적 네임스페이스
- `window.*` 없이 모듈 간 직접 참조 (로드 순서로 해결)

### 2. 오프스크린 색상 피킹 (M02)
```
[메인 캔버스] — 사용자에게 보이는 렌더
[피킹 캔버스] — pickColor로 각 프로빈스를 채워 클릭 감지용
  → 클릭 픽셀 색상 → ProvinceManager.getByPickColor()
```
- 장점: 불규칙 폴리곤 클릭 판정을 O(1)로 처리
- 주의: 뷰 변환(줌/패닝) 때마다 피킹 버퍼 재생성 필요

### 3. Dirty Flag 렌더링 (M02)
```javascript
let needsRedraw = true;
function render() {
  if (!needsRedraw) return; // 변경 없으면 스킵
  needsRedraw = false;
  // ... 실제 렌더링
}
```
- 변경 없을 때 렌더 스킵 → CPU 절약

### 4. JSON 드리븐 데이터 (M03)
- 프로빈스, 세력, 지형 모두 순수 데이터 객체
- editor.html에서 내보낸 JSON으로 교체 가능
- 향후 Unity 포팅 시 동일 JSON 구조 재사용

---

## 데이터 구조 레퍼런스

### Province
```typescript
interface Province {
  id:          number;      // 고유 ID (1부터)
  name:        string;      // 표시명
  faction:     string;      // 세력 ID ("고려", "북방부족", ...)
  terrain:     string;      // 지형 ID ("plains", "mountain", ...)
  resources:   string[];    // 자원 목록
  buildings:   string[];    // 건물 목록
  population:  number;      // 인구 (명)
  development: number;      // 개발도 1~8
  pickColor:   string;      // 피킹 색상 "#RRGGBB" (고유)
  poly:        [number,number][]; // 폴리곤 좌표 배열
  color?:      string;      // 에디터 커스텀 색상 (선택)
}
```

### Faction
```typescript
interface Faction {
  id:          string;   // 세력 ID
  name:        string;   // 표시명
  color:       string;   // 맵 표시색 (#RRGGBB)
  ruler:       string;   // 군주명 (표시용, M05 CharacterManager가 실제 관리)
  capital:     number|null; // 수도 Province ID
  description: string;
}
```

### Character
```typescript
interface Character {
  id:         number;
  name:       string;
  faction:    string;    // 세력 ID
  role:       'ruler'|'heir'|'general'|'advisor'|'consort';
  age:        number;
  dynasty:    string;    // 가문명
  traits:     string[];  // 특성 ID 배열
  stats: {
    martial:     number; // 무력
    diplomacy:   number; // 외교
    stewardship: number; // 행정
    intrigue:    number; // 음모
  };
  married_to: number|null; // 배우자 Character ID
}
```

### Terrain
```typescript
interface Terrain {
  name:    string;
  color:   string;  // 지형 맵 표시색
  icon:    string;  // 이모지
  taxMod:  number;  // 세금 보정 배율
  defMod:  number;  // 방어 보정 배율
}
```

### FactionState
```typescript
interface FactionState {
  gold:      number; // 금화 (부동소수)
  prestige:  number; // 위신 0~100
  stability: number; // 안정도 0~100
  income:    number; // 최근 월수입 (캐시)
  expenses:  number; // 최근 월지출 (캐시)
}
```

---

## 좌표계

```
원점 (0,0) — 맵 좌상단
X축 — 오른쪽 (+)
Y축 — 아래쪽 (+)
기준 맵 크기 — 약 900×780 (폴리곤 좌표 기준)

캔버스 렌더: worldCoord × scale + offset
  toCanvas(wx, wy) = [wx*scale+offsetX, wy*scale+offsetY]
  toWorld(cx, cy)  = [(cx-offsetX)/scale, (cy-offsetY)/scale]
```

---

## 경제 공식 (M04)

```
월수입 = Σ(province) {
  개발도 × 8금 × 지형세금보정
  + 건물 보너스 (시장+20, 교역소+15, 항구+18, 창고+10, 왕궁+30)
}

월지출 = 프로빈스 수 × 12금

순수입 = 월수입 - 월지출
적자시 → stability -= 0.5/월
흑자시 → stability += 0.2/월
```

---

## 사망 확률 공식 (M05)

```javascript
deathChance =
  age >= 75 ? 0.25 :   // 연간 25% (매우 노령)
  age >= 65 ? 0.10 :   // 연간 10%
  age >= 55 ? 0.04 :   // 연간 4%
  age >= 45 ? 0.015 :  // 연간 1.5%
              0.005;   // 연간 0.5%

'병약한' 특성 보유 시 × 2.5 배율
```

---

## 향후 확장 계획 (Phase 3~6)

| Phase | 모듈 | 핵심 추가 사항 |
|-------|------|---------------|
| 3 | M06, M07 | 병력 이동, 전투 계산 |
| 4 | M09, M13, M15 | 경제 자동화, 이벤트 엔진, UI 고도화 |
| 5 | M08, M10, M11 | 전쟁/점령, 교역로, 외교 조약 |
| 6 | M12, M14, M16, M17 | 기술 트리, AI, 세이브/로드, 시나리오 |
