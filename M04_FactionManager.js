/**
 * M04 — FACTION MANAGER
 * 세력 자원(금화/위신/안정도), 관계도(-100~+100), 월별 경제 틱
 *
 * 의존 모듈: M03_ProvinceManager
 * 공개 API:
 *   FactionManager.getRelation(a, b)         — 두 세력 관계도 반환 (-100~100)
 *   FactionManager.modRelation(a, b, delta)  — 관계도 변경
 *   FactionManager.getRelationLabel(val)     — 관계 단계 레이블 { text, color }
 *   FactionManager.getFactionState(id)       — 세력 자원 상태 반환
 *   FactionManager.getAllFactionStates()     — 전체 세력 상태 맵
 *   FactionManager.calcMonthlyIncome(fid)   — 월 수입/지출 계산
 *   FactionManager.onMonthTick()            — GameCore 'newMonth' 이벤트에 연결
 *
 * 경제 설계 (GDD 철학 #1: 경제 비개입):
 *   수입 = Σ(개발도 × BASE_INCOME_PER_DEV × 지형세금보정) + 건물 보너스
 *   지출 = 프로빈스 수 × EXPENSE_PER_PROVINCE
 *   적자 → 안정도 하락 / 흑자 → 안정도 점진 회복
 *
 * 관계도 설계:
 *   매월 자연 드리프트 (0으로 수렴) — 외교 행동 없으면 중립화
 *   혼인/조약/전쟁 등 이벤트가 delta를 통해 관계도 변경
 */
"use strict";

const FactionManager = (() => {

  // ── 경제 상수 ──────────────────────────────────────────
  const BASE_INCOME_PER_DEV  = 8;   // 개발도 1 = 금화 8/월
  const EXPENSE_PER_PROVINCE = 12;  // 프로빈스 1개 = 금화 12/월 유지비

  // 건물별 수입 보너스 (금화/월)
  const BUILDING_INCOME = {
    '시장':   20,
    '교역소': 15,
    '항구':   18,
    '창고':   10,
    '왕궁':   30,
  };

  // ── 세력별 초기 상태 ───────────────────────────────────
  const FACTION_STATE = {
    "고려":    { gold: 850,  prestige: 72, stability: 68, income: 0, expenses: 0 },
    "북방부족":{ gold: 320,  prestige: 58, stability: 55, income: 0, expenses: 0 },
    "서방상인":{ gold: 1100, prestige: 65, stability: 70, income: 0, expenses: 0 },
    "동방호족":{ gold: 430,  prestige: 50, stability: 60, income: 0, expenses: 0 },
    "남방":    { gold: 560,  prestige: 55, stability: 62, income: 0, expenses: 0 },
  };

  // ── 초기 관계도 ────────────────────────────────────────
  // 키 형식: "세력A|세력B" (알파벳순 정렬, getRelation에서 자동 처리)
  const RELATIONS = {
    "고려|북방부족":   -35,
    "고려|서방상인":    20,
    "고려|동방호족":    10,
    "고려|남방":        30,
    "북방부족|서방상인":-10,
    "북방부족|동방호족":  5,
    "북방부족|남방":   -20,
    "서방상인|동방호족": 15,
    "서방상인|남방":    25,
    "동방호족|남방":    10,
  };

  // ── 관계도 유틸 ────────────────────────────────────────
  function _relKey(a, b) {
    return [a, b].sort().join('|');
  }

  function getRelation(a, b) {
    return RELATIONS[_relKey(a, b)] ?? 0;
  }

  function modRelation(a, b, delta) {
    const k     = _relKey(a, b);
    RELATIONS[k] = Math.max(-100, Math.min(100, (RELATIONS[k] ?? 0) + delta));
  }

  /**
   * 관계도 수치 → 단계 레이블 변환
   * @returns {{ text: string, color: string }}
   */
  function getRelationLabel(val) {
    if (val >=  60) return { text: '동맹', color: '#4ecf8a' };
    if (val >=  25) return { text: '우호', color: '#8bc34a' };
    if (val >= -10) return { text: '중립', color: '#90a0b0' };
    if (val >= -40) return { text: '경계', color: '#f5a623' };
    return               { text: '적대', color: '#e94560' };
  }

  // ── 수입 계산 ─────────────────────────────────────────
  function calcMonthlyIncome(factionId) {
    const provs = ProvinceManager.getFactionProvinces(factionId);
    let income = 0;

    provs.forEach(p => {
      const t = ProvinceManager.getTerrain(p.terrain);
      income += p.development * BASE_INCOME_PER_DEV * (t?.taxMod ?? 1);
      p.buildings.forEach(b => { income += BUILDING_INCOME[b] ?? 0; });
    });

    const expenses = provs.length * EXPENSE_PER_PROVINCE;
    return { income: Math.round(income), expenses };
  }

  // ── 월 틱 (GameCore 'newMonth' 이벤트에 연결) ──────────
  function onMonthTick() {
    const factions = ProvinceManager.getFactions();

    Object.keys(FACTION_STATE).forEach(fid => {
      if (!factions[fid]) return;
      const s                 = FACTION_STATE[fid];
      const { income, expenses } = calcMonthlyIncome(fid);
      s.income   = income;
      s.expenses = expenses;
      s.gold     = Math.round(s.gold + income - expenses);

      // 안정도: 적자면 하락, 흑자면 회복
      if (income < expenses) s.stability = Math.max(0,   s.stability - 0.5);
      else                   s.stability = Math.min(100, s.stability + 0.2);

      // 위신: 점진 회복
      s.prestige = Math.min(100, s.prestige + 0.1);
    });

    // 관계도 자연 드리프트 (매월 0 방향으로 수렴)
    Object.keys(RELATIONS).forEach(k => {
      RELATIONS[k] = RELATIONS[k] > 0
        ? Math.max(0, RELATIONS[k] - 0.3)
        : Math.min(0, RELATIONS[k] + 0.2);
    });

    _refreshStatusBar();
  }

  // ── 상태바 업데이트 (고려 기준) ───────────────────────
  function _refreshStatusBar() {
    const s  = FACTION_STATE['고려'];
    const el = document.getElementById('status-faction-res');
    if (s && el) {
      el.textContent =
        `고려: 💰${s.gold.toLocaleString()}  위신${s.prestige.toFixed(0)}  안정${s.stability.toFixed(0)}`;
    }
  }

  // ── 공개 API ───────────────────────────────────────────
  function getFactionState(id)    { return FACTION_STATE[id] ? { ...FACTION_STATE[id] } : null; }
  function getAllFactionStates()  { return FACTION_STATE; }

  return {
    getRelation, modRelation, getRelationLabel,
    getFactionState, getAllFactionStates,
    calcMonthlyIncome, onMonthTick,
  };
})();
