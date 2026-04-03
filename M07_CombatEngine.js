/**
 * M07 — CombatEngine
 * 전투력 계산, 승패 판정, 손실 처리, 점령
 *
 * 의존성: GameCore, ProvinceManager, FactionManager, CharacterManager,
 *         MilitaryManager, Notifications, MapRenderer
 *
 * 이벤트 수신: GameCore.on('battleStart', resolveBattle)
 */

"use strict";

const CombatEngine = (() => {

  // ── 게임 밸런스 상수 ──
  const ATTACKER_CASUALTY_RATE = 0.25; // 공격자 손실 비율
  const DEFENDER_CASUALTY_RATE = 0.30; // 수비자 손실 비율
  const MIN_DIVISION_SIZE      = 50;   // 사단 해산 임계 병력
  const COMBAT_VARIANCE_MIN    = 0.93; // 전투 랜덤 분산 하한 (±7%)
  const COMBAT_VARIANCE_RANGE  = 0.14; // 전투 랜덤 분산 범위

  let _totalBattles = 0;

  // ── 전투력 계산 ──

  /**
   * 사단/주둔군 전투력 계산.
   * = Σ(unit.count × unitType.power)
   *   × terrain.defMod  (수비측만)
   *   × (1 + martial × 0.05)
   *
   * @param {{infantry:number, cavalry:number, archers:number, siege:number}} units
   * @param {string} factionId
   * @param {number} provinceId
   * @param {boolean} isDefender 수비측이면 지형 보정 적용
   * @returns {number}
   */
  function calcCombatPower(units, factionId, provinceId, isDefender) {
    const UNIT_TYPES = MilitaryManager.getUnitTypes();
    let power = 0;
    Object.entries(UNIT_TYPES).forEach(([type, ut]) => {
      power += (units[type] || 0) * ut.power;
    });
    // 지형 방어 보정 (수비측만)
    if (isDefender) {
      const prov = ProvinceManager.getById(provinceId);
      if (prov) {
        const terrain = ProvinceManager.getTerrain(prov.terrain);
        if (terrain) power *= terrain.defMod;
      }
    }
    // 지휘관 무력 보정
    const ruler = CharacterManager.getRuler(factionId);
    if (ruler) {
      const stats = CharacterManager.getEffectiveStats(ruler);
      power *= (1 + (stats.martial || 0) * MilitaryManager.getMartialBonus());
    }
    return Math.max(1, power);
  }

  // ── 손실 계산 ──
  /**
   * 전투 손실 계산.
   * attLoss = atkTotal × (1 - ratio) × ATTACKER_CASUALTY_RATE
   * defLoss = defTotal × ratio × DEFENDER_CASUALTY_RATE
   */
  function _calcCasualties(atkPower, defPower, atkUnits, defUnits) {
    const atkTotal = Object.values(atkUnits).reduce((s, v) => s + v, 0);
    const defTotal = Object.values(defUnits).reduce((s, v) => s + v, 0);
    const ratio = atkPower / (atkPower + defPower);
    return {
      attackerLoss: Math.round(atkTotal * (1 - ratio) * ATTACKER_CASUALTY_RATE),
      defenderLoss: Math.round(defTotal * ratio       * DEFENDER_CASUALTY_RATE),
    };
  }

  function _applyUnitCasualties(units, totalLoss) {
    const total = Object.values(units).reduce((s, v) => s + v, 0);
    if (total === 0) return { ...units };
    const ratio = Math.min(totalLoss / total, 1);
    const result = {};
    Object.entries(units).forEach(([type, count]) => {
      result[type] = Math.max(0, Math.round(count * (1 - ratio)));
    });
    return result;
  }

  // ── 점령 처리 ──
  /**
   * 프로빈스 점령.
   * province.faction 변경 + garrison 갱신 + 알림 + 지도 갱신
   */
  function occupyProvince(provinceId, newFactionId) {
    const prov = ProvinceManager.getById(provinceId);
    if (!prov) return;
    const oldFaction = prov.faction;
    if (oldFaction === newFactionId) return;
    prov.faction = newFactionId;
    MilitaryManager.updateGarrisonOwner(provinceId, newFactionId);
    Notifications.push(`\uD83C\uDFF4 ${prov.name} 점령! ${oldFaction} \u2192 ${newFactionId}`, 'alert');
    MapRenderer.markDirty();
    FactionManager.modRelation(oldFaction, newFactionId, -15);
  }

  // ── 전투 해결 메인 함수 ──
  /**
   * battleStart 이벤트 처리.
   * @param {{ attackerDivId:number, defenderInfo:{type:string, id:number}, provinceId:number }} param
   */
  function resolveBattle({ attackerDivId, defenderInfo, provinceId }) {
    const atkDiv = MilitaryManager.getDivisionById(attackerDivId);
    if (!atkDiv) return;
    const prov = ProvinceManager.getById(provinceId);
    if (!prov) {
      MilitaryManager.setDivisionState(attackerDivId, 'idle');
      return;
    }

    // 수비 정보 취득
    let defUnits, defFaction, defDivId = null;
    if (defenderInfo.type === 'garrison') {
      const g = MilitaryManager.getGarrison(provinceId);
      if (!g) { MilitaryManager.setDivisionState(attackerDivId, 'idle'); return; }
      defUnits  = { infantry:g.infantry, cavalry:g.cavalry, archers:g.archers, siege:g.siege };
      defFaction = g.factionId;
    } else {
      const defDiv = MilitaryManager.getDivisionById(defenderInfo.id);
      if (!defDiv) { MilitaryManager.setDivisionState(attackerDivId, 'idle'); return; }
      defUnits  = { ...defDiv.units };
      defFaction = defDiv.factionId;
      defDivId  = defDiv.id;
    }

    // 같은 세력이면 전투 없음
    if (atkDiv.factionId === defFaction) {
      MilitaryManager.setDivisionState(attackerDivId, 'idle');
      if (defDivId !== null) MilitaryManager.setDivisionState(defDivId, 'idle');
      return;
    }

    _totalBattles++;
    _updateBattleStatus();

    // 전투력 계산 + 랜덤 분산 (±7%)
    const atkPower = calcCombatPower(atkDiv.units, atkDiv.factionId, provinceId, false);
    const defPower = calcCombatPower(defUnits, defFaction, provinceId, true);
    const atkRoll  = atkPower * (COMBAT_VARIANCE_MIN + Math.random() * COMBAT_VARIANCE_RANGE);
    const defRoll  = defPower * (COMBAT_VARIANCE_MIN + Math.random() * COMBAT_VARIANCE_RANGE);
    const atkWins  = atkRoll > defRoll;

    // 손실 계산
    const { attackerLoss, defenderLoss } = _calcCasualties(atkRoll, defRoll, atkDiv.units, defUnits);
    const newAtkUnits = _applyUnitCasualties(atkDiv.units, attackerLoss);
    const newDefUnits = _applyUnitCasualties(defUnits, defenderLoss);
    const atkTotal = Object.values(newAtkUnits).reduce((s, v) => s + v, 0);
    const defTotal = Object.values(newDefUnits).reduce((s, v) => s + v, 0);

    Notifications.push(
      `\u2694 전투: ${prov.name} \u2014 ${atkDiv.factionId} ${atkWins ? '승리' : '패배'} vs ${defFaction}`,
      atkWins ? 'good' : 'warn'
    );

    if (atkWins) {
      // 공격자 승리 처리
      if (atkTotal < MIN_DIVISION_SIZE) {
        MilitaryManager.disbandDivision(attackerDivId);
        Notifications.push(`${atkDiv.factionId}: 사단 해산 (병력 소진)`, 'warn');
      } else {
        MilitaryManager.updateDivision(attackerDivId, newAtkUnits);
        MilitaryManager.setDivisionState(attackerDivId, 'idle');
      }
      // 수비자 패배 처리
      if (defDivId !== null) {
        if (defTotal < MIN_DIVISION_SIZE) {
          MilitaryManager.disbandDivision(defDivId);
        } else {
          MilitaryManager.updateDivision(defDivId, newDefUnits);
          MilitaryManager.retreatDivision(defDivId, provinceId);
        }
      } else {
        MilitaryManager.updateGarrisonCasualties(provinceId, {
          infantry: (defUnits.infantry || 0) - (newDefUnits.infantry || 0),
          cavalry:  (defUnits.cavalry  || 0) - (newDefUnits.cavalry  || 0),
          archers:  (defUnits.archers  || 0) - (newDefUnits.archers  || 0),
          siege:    (defUnits.siege    || 0) - (newDefUnits.siege    || 0),
        });
      }
      occupyProvince(provinceId, atkDiv.factionId);
    } else {
      // 공격자 패배 처리
      if (atkTotal < MIN_DIVISION_SIZE) {
        MilitaryManager.disbandDivision(attackerDivId);
        Notifications.push(`${atkDiv.factionId}: 사단 해산 (병력 소진)`, 'warn');
      } else {
        MilitaryManager.updateDivision(attackerDivId, newAtkUnits);
        MilitaryManager.retreatDivision(attackerDivId, provinceId);
      }
      // 수비자 손실 처리
      if (defDivId !== null) {
        if (defTotal < MIN_DIVISION_SIZE) {
          MilitaryManager.disbandDivision(defDivId);
        } else {
          MilitaryManager.updateDivision(defDivId, newDefUnits);
          MilitaryManager.setDivisionState(defDivId, 'idle');
        }
      } else {
        MilitaryManager.updateGarrisonCasualties(provinceId, {
          infantry: (defUnits.infantry || 0) - (newDefUnits.infantry || 0),
          cavalry:  (defUnits.cavalry  || 0) - (newDefUnits.cavalry  || 0),
          archers:  (defUnits.archers  || 0) - (newDefUnits.archers  || 0),
          siege:    (defUnits.siege    || 0) - (newDefUnits.siege    || 0),
        });
      }
    }

    MapRenderer.markDirty();
    _updateBattleStatus();
  }

  function _updateBattleStatus() {
    const el = document.getElementById('status-battles');
    if (el) el.textContent = `전투: ${_totalBattles}건`;
  }

  return { resolveBattle, calcCombatPower, occupyProvince };
})();
