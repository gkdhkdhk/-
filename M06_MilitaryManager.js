/**
 * M06 — MilitaryManager
 * 병력/사단 시스템, 주둔군, 사단 이동, AI 행동
 *
 * 의존성: GameCore, ProvinceManager, FactionManager, CharacterManager
 */

"use strict";

const MilitaryManager = (() => {

  // ── 게임 밸런스 상수 ──
  const MARTIAL_BONUS_PER_POINT = 0.05; // 무력 1당 전투력 보정 (+5%)

  // ── 병종 정의 ──
  /** @type {Object.<string, {name:string, power:number, cost:number, upkeep:number}>} */
  const UNIT_TYPES = {
    infantry: { name:'보병',   power:1.0, cost:50,  upkeep:3  },
    cavalry:  { name:'기병',   power:2.0, cost:120, upkeep:8  },
    archers:  { name:'궁수',   power:0.8, cost:40,  upkeep:2  },
    siege:    { name:'공성대', power:0.3, cost:200, upkeep:10 },
  };

  // ── 세력별 초기 병력 풀 ──
  const INITIAL_GARRISON = {
    '고려':    { infantry:800, cavalry:300, archers:400, siege:50 },
    '북방부족':{ infantry:400, cavalry:800, archers:200, siege:10 },
    '서방상인':{ infantry:500, cavalry:200, archers:600, siege:30 },
    '동방호족':{ infantry:600, cavalry:400, archers:300, siege:20 },
    '남방':    { infantry:600, cavalry:300, archers:350, siege:25 },
  };

  // ── 프로빈스 인접 관계 ──
  const ADJACENCY = {
    1:  [2, 4, 5],
    2:  [1, 3, 6, 9],
    3:  [2, 8, 10],
    4:  [1, 5, 7],
    5:  [1, 4, 6, 7],
    6:  [2, 5, 7, 9, 11],
    7:  [4, 5, 6, 11, 12],
    8:  [3, 9, 10, 16],
    9:  [2, 6, 8, 11, 18],
    10: [3, 8, 16],
    11: [6, 7, 9, 12, 13, 17, 18],
    12: [7, 11, 13],
    13: [11, 12, 14, 17],
    14: [13, 15, 17],
    15: [14],
    16: [8, 10, 18],
    17: [11, 13, 14, 18],
    18: [9, 11, 16, 17],
  };

  // ── 내부 상태 ──
  let _garrisonData = {};
  /**
   * @type {Array<{
   *   id: number,
   *   factionId: string,
   *   units: {infantry:number, cavalry:number, archers:number, siege:number},
   *   locationId: number,
   *   targetId: number|null,
   *   travelDaysLeft: number,
   *   state: 'idle'|'moving'|'fighting'
   * }>}
   */
  let _divisions = [];
  let _nextDivId = 1;
  let _tickCount = 0;

  // ── 초기화 ──

  /**
   * 세력별 초기 주둔군 배치.
   * 수도 프로빈스는 100%, 나머지는 30%.
   */
  function initGarrison() {
    ProvinceManager.getAll().forEach(p => {
      if (p.faction === '미지') return;
      const base = INITIAL_GARRISON[p.faction];
      if (!base) return;
      const fDef = ProvinceManager.getFaction(p.faction);
      const isCapital = fDef && fDef.capital === p.id;
      const scale = isCapital ? 1.0 : 0.3;
      _garrisonData[p.id] = {
        factionId: p.faction,
        infantry: Math.round(base.infantry * scale),
        cavalry:  Math.round(base.cavalry  * scale),
        archers:  Math.round(base.archers  * scale),
        siege:    Math.round(base.siege    * scale),
      };
    });
  }

  /**
   * AI 초기 사단 생성: 각 세력 수도에 사단 1개씩 (50% 병력).
   */
  function initAIDivisions() {
    const fDefs = ProvinceManager.getFactions();
    Object.values(fDefs).forEach(f => {
      if (f.id === '미지' || !f.capital) return;
      const base = INITIAL_GARRISON[f.id];
      if (!base) return;
      createDivision(f.id, f.capital, {
        infantry: Math.round(base.infantry * 0.5),
        cavalry:  Math.round(base.cavalry  * 0.5),
        archers:  Math.round(base.archers  * 0.5),
        siege:    Math.round(base.siege    * 0.5),
      });
    });
  }

  // ── 사단 생성/조회 ──

  /**
   * 새 사단 생성.
   * @param {string} factionId
   * @param {number} provinceId
   * @param {{infantry:number, cavalry:number, archers:number, siege:number}} units
   * @returns {number} divisionId
   */
  function createDivision(factionId, provinceId, units) {
    const id = _nextDivId++;
    _divisions.push({
      id, factionId,
      units: { infantry:0, cavalry:0, archers:0, siege:0, ...units },
      locationId: provinceId,
      targetId: null,
      travelDaysLeft: 0,
      state: 'idle',
    });
    return id;
  }

  /**
   * 사단 이동 명령.
   * 이동 시간: 인접 3일, 비인접 5일.
   * @returns {boolean}
   */
  function moveDivision(divisionId, targetProvinceId) {
    const div = _divisions.find(d => d.id === divisionId);
    if (!div || div.state !== 'idle') return false;
    const isAdj = (ADJACENCY[div.locationId] || []).includes(targetProvinceId);
    div.targetId = targetProvinceId;
    div.travelDaysLeft = isAdj ? 3 : 5;
    div.state = 'moving';
    return true;
  }

  /** @returns {object|null} */
  function getDivisionById(divId) {
    return _divisions.find(d => d.id === divId) || null;
  }

  /**
   * 특정 프로빈스에 있는 모든 사단 반환.
   * @returns {Array}
   */
  function getDivisionsAt(provinceId) {
    return _divisions.filter(d => d.locationId === provinceId);
  }

  /**
   * 특정 세력의 모든 사단 반환.
   * @returns {Array}
   */
  function getDivisionsByFaction(factionId) {
    return _divisions.filter(d => d.factionId === factionId);
  }

  /**
   * 프로빈스 주둔군 정보 반환.
   * @returns {object|null}
   */
  function getGarrison(provinceId) {
    return _garrisonData[provinceId] || null;
  }

  /**
   * 주둔군 전투력 계산.
   * @returns {number}
   */
  function getGarrisonPower(provinceId) {
    const g = _garrisonData[provinceId];
    if (!g) return 0;
    return calcDivisionPower(g, g.factionId, provinceId);
  }

  // ── 전투력 계산 ──
  /**
   * 사단/주둔군 전투력 계산.
   * = Σ(unit.count × unitType.power) × (1 + martial × 0.05)
   */
  function calcDivisionPower(units, factionId, provinceId) {
    let power = 0;
    Object.entries(UNIT_TYPES).forEach(([type, ut]) => {
      power += (units[type] || 0) * ut.power;
    });
    const ruler = CharacterManager.getRuler(factionId);
    if (ruler) {
      const stats = CharacterManager.getEffectiveStats(ruler);
      power *= (1 + (stats.martial || 0) * MARTIAL_BONUS_PER_POINT);
    }
    return Math.max(1, power);
  }

  // ── 전투 체크 ──
  function _checkBattleAtProvince(provinceId) {
    const idleDivs = _divisions.filter(d => d.locationId === provinceId && d.state === 'idle');
    if (idleDivs.length === 0) return;

    const g = _garrisonData[provinceId];
    if (g && g.factionId !== '미지') {
      for (const div of idleDivs) {
        if (div.factionId !== g.factionId) {
          div.state = 'fighting';
          GameCore.emit('battleStart', {
            attackerDivId: div.id,
            defenderInfo: { type: 'garrison', id: provinceId },
            provinceId,
          });
          return;
        }
      }
    }

    if (idleDivs.length >= 2) {
      for (let i = 0; i < idleDivs.length; i++) {
        for (let j = i + 1; j < idleDivs.length; j++) {
          const d1 = idleDivs[i], d2 = idleDivs[j];
          if (d1.factionId !== d2.factionId && d1.state === 'idle' && d2.state === 'idle') {
            d1.state = 'fighting';
            d2.state = 'fighting';
            GameCore.emit('battleStart', {
              attackerDivId: d1.id,
              defenderInfo: { type: 'division', id: d2.id },
              provinceId,
            });
            return;
          }
        }
      }
    }
  }

  // ── 틱 처리 ──
  /**
   * GameCore 'tick' 이벤트에 연결.
   * 1. 이동 중 사단 travelDaysLeft 감소
   * 2. 0이 되면 도착 처리 + 전투 체크
   * 3. 30일마다 AI 행동
   */
  function onTick() {
    _tickCount++;
    _divisions.forEach(div => {
      if (div.state === 'moving') {
        div.travelDaysLeft--;
        if (div.travelDaysLeft <= 0) {
          div.locationId = div.targetId;
          div.targetId = null;
          div.state = 'idle';
          GameCore.emit('divisionArrived', { divisionId: div.id, provinceId: div.locationId });
          _checkBattleAtProvince(div.locationId);
        }
      }
    });
    if (_tickCount % 30 === 0) _aiTick();
  }

  // ── AI 행동 ──
  function _aiTick() {
    Object.keys(INITIAL_GARRISON).forEach(fid => {
      const idleDivs = getDivisionsByFaction(fid).filter(d => d.state === 'idle');
      if (idleDivs.length === 0) {
        _aiCreateDivision(fid);
        return;
      }
      idleDivs.forEach(div => {
        const target = _findAttackTarget(fid, div.locationId);
        if (target !== null) moveDivision(div.id, target);
      });
    });
  }

  /**
   * BFS로 최가까운 적대 프로빈스 향한 첫 이동 대상 탐색.
   * rel < 0 인 세력의 프로빈스를 적대로 판단.
   * @returns {number|null} targetProvinceId
   */
  function _findAttackTarget(fid, fromId) {
    const adjIds = ADJACENCY[fromId] || [];
    for (const adjId of adjIds) {
      const p = ProvinceManager.getById(adjId);
      if (!p || p.faction === fid || p.faction === '미지') continue;
      if (FactionManager.getRelation(fid, p.faction) < 0) return adjId;
    }
    const visited = new Set([fromId]);
    const queue = [[fromId, null]];
    while (queue.length > 0) {
      const [curr, firstStep] = queue.shift();
      for (const adjId of (ADJACENCY[curr] || [])) {
        if (visited.has(adjId)) continue;
        visited.add(adjId);
        const p = ProvinceManager.getById(adjId);
        if (!p) continue;
        const step = firstStep !== null ? firstStep : adjId;
        if (p.faction !== fid && p.faction !== '미지') {
          if (FactionManager.getRelation(fid, p.faction) < 0) return step;
        } else if (p.faction === fid) {
          queue.push([adjId, step]);
        }
      }
    }
    return null;
  }

  function _aiCreateDivision(fid) {
    const fDef = ProvinceManager.getFaction(fid);
    if (!fDef || !fDef.capital) return;
    const fs = FactionManager.getAllFactionStates()[fid];
    if (!fs || fs.gold < 300) return;
    const base = INITIAL_GARRISON[fid];
    if (!base) return;
    if (Math.random() < 0.3) {
      createDivision(fid, fDef.capital, {
        infantry: Math.round(base.infantry * 0.3),
        cavalry:  Math.round(base.cavalry  * 0.3),
        archers:  Math.round(base.archers  * 0.3),
        siege:    0,
      });
      fs.gold = Math.round(fs.gold - 200);
    }
  }

  // ── 월 유지비 ──
  /**
   * GameCore 'newMonth' 이벤트에 연결.
   * 유지비: unit.count × upkeep / 100 (per 100 troops)
   */
  function onMonthUpkeep() {
    const states = FactionManager.getAllFactionStates();
    Object.keys(INITIAL_GARRISON).forEach(fid => {
      let upkeep = 0;
      getDivisionsByFaction(fid).forEach(div => {
        Object.entries(UNIT_TYPES).forEach(([type, ut]) => {
          upkeep += Math.ceil((div.units[type] || 0) * ut.upkeep / 100);
        });
      });
      if (states[fid]) states[fid].gold = Math.round(states[fid].gold - upkeep);
    });
  }

  // ── 사단 상태 변경 (CombatEngine 에서 사용) ──
  function setDivisionState(divId, state) {
    const div = _divisions.find(d => d.id === divId);
    if (div) div.state = state;
  }

  function updateDivision(divId, newUnits) {
    const div = _divisions.find(d => d.id === divId);
    if (div) div.units = { ...newUnits };
  }

  function disbandDivision(divId) {
    _divisions = _divisions.filter(d => d.id !== divId);
  }

  function retreatDivision(divId, fromProvinceId) {
    const div = _divisions.find(d => d.id === divId);
    if (!div) return;
    const friendlyAdj = (ADJACENCY[fromProvinceId] || []).filter(id => {
      const p = ProvinceManager.getById(id);
      return p && p.faction === div.factionId;
    });
    if (friendlyAdj.length > 0) {
      div.locationId = friendlyAdj[0];
      div.state = 'idle';
    } else {
      disbandDivision(divId);
    }
  }

  function updateGarrisonOwner(provinceId, newFactionId) {
    const g = _garrisonData[provinceId];
    if (g) {
      g.factionId = newFactionId;
      g.infantry  = Math.round(g.infantry * 0.2);
      g.cavalry   = Math.round(g.cavalry  * 0.2);
      g.archers   = Math.round(g.archers  * 0.2);
      g.siege     = Math.round(g.siege    * 0.2);
    } else {
      const base = INITIAL_GARRISON[newFactionId];
      if (base) {
        _garrisonData[provinceId] = {
          factionId: newFactionId,
          infantry: Math.round(base.infantry * 0.1),
          cavalry:  0,
          archers:  Math.round(base.archers  * 0.1),
          siege:    0,
        };
      }
    }
  }

  function updateGarrisonCasualties(provinceId, casualties) {
    const g = _garrisonData[provinceId];
    if (!g) return;
    Object.entries(casualties).forEach(([type, loss]) => {
      if (g[type] !== undefined) g[type] = Math.max(0, g[type] - (loss || 0));
    });
  }

  return {
    initGarrison, initAIDivisions,
    createDivision, moveDivision,
    getDivisionById, getDivisionsAt, getDivisionsByFaction,
    getGarrison, getGarrisonPower, calcDivisionPower,
    onTick, onMonthUpkeep,
    setDivisionState, updateDivision, disbandDivision,
    retreatDivision, updateGarrisonOwner, updateGarrisonCasualties,
    getUnitTypes: () => UNIT_TYPES,
    getAdjacency: () => ADJACENCY,
    getMartialBonus: () => MARTIAL_BONUS_PER_POINT,
  };
})();
