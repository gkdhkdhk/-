/**
 * M05 — CHARACTER MANAGER
 * 캐릭터 정의, 특성 시스템, 나이 진행, 사망/계승, 혼인
 *
 * 의존 모듈: M03_ProvinceManager, M04_FactionManager, Notifications
 * 공개 API:
 *   CharacterManager.getAll()                   — 전체 캐릭터 배열
 *   CharacterManager.getById(id)                — ID로 캐릭터 조회
 *   CharacterManager.getByFaction(fid)           — 세력별 캐릭터 배열
 *   CharacterManager.getRuler(fid)              — 세력 군주 반환
 *   CharacterManager.getHeir(fid)               — 세력 후계자 반환
 *   CharacterManager.getTrait(name)             — 특성 정의 반환
 *   CharacterManager.getAllTraits()             — 전체 특성 정의 맵
 *   CharacterManager.getEffectiveStats(char)    — 특성 보정 적용된 최종 능력치
 *   CharacterManager.onYearTick()               — GameCore 'newYear' 이벤트에 연결
 *   CharacterManager.marry(charId1, charId2)    — 혼인 처리
 *
 * 캐릭터 구조:
 *   { id, name, faction, role, age, dynasty, traits[], stats{}, married_to }
 *   role: 'ruler' | 'heir' | 'general' | 'advisor' | 'consort'
 *   stats: { martial, diplomacy, stewardship, intrigue }
 *
 * 특성 시스템:
 *   12종 특성 각각 type(positive/negative), icon, desc, effects 보유
 *   getEffectiveStats()에서 기본 stats + 특성 effects 합산
 *
 * 계승 흐름 (GDD 철학 #4: 체제의 연속):
 *   군주 사망 → getHeir() 찾음 → heir.role = 'ruler'
 *            → 새 후계자 자동 생성 (generateHeir)
 *            → 후계자 없으면 안정도 -30, 신군주 생성
 */
"use strict";

const CharacterManager = (() => {

  // ── 특성 정의 ──────────────────────────────────────────
  // effects: stats에 더해지는 보정값 (마이너스 가능)
  const TRAIT_DEFS = {
    용맹한:    { type:'positive', icon:'⚔', desc:'전투 보정 +15%', effects:{ martial:3 } },
    비겁한:    { type:'negative', icon:'😰', desc:'전투 보정 -15%', effects:{ martial:-3 } },
    지략가:    { type:'positive', icon:'🎯', desc:'군사 행동 이점',  effects:{ martial:2, stewardship:1 } },
    외교관:    { type:'positive', icon:'🕊', desc:'관계도 +10',     effects:{ diplomacy:3 } },
    탐욕스러운:{ type:'negative', icon:'💰', desc:'세금+, 관계-',   effects:{ stewardship:2, diplomacy:-2 } },
    현명한:    { type:'positive', icon:'📜', desc:'모든 능력치 +1', effects:{ martial:1, diplomacy:1, stewardship:1, intrigue:1 } },
    잔인한:    { type:'negative', icon:'🩸', desc:'안정도 하락',    effects:{ martial:2, diplomacy:-3 } },
    인자한:    { type:'positive', icon:'❤',  desc:'민심 상승',      effects:{ diplomacy:2, stewardship:-1 } },
    청렴한:    { type:'positive', icon:'⚖',  desc:'세금 효율 +',   effects:{ stewardship:2, diplomacy:1 } },
    교활한:    { type:'negative', icon:'🕵', desc:'음모에 능함',    effects:{ intrigue:3, diplomacy:-1 } },
    노련한:    { type:'positive', icon:'🏅', desc:'경험 보너스',    effects:{ martial:1, stewardship:1 } },
    병약한:    { type:'negative', icon:'🤒', desc:'조기 사망 위험', effects:{ martial:-1 } },
  };

  // ── 초기 캐릭터 로스터 ─────────────────────────────────
  let characters = [
    // ── 고려 ──
    { id:1,  name:'왕 건 2세',    faction:'고려',     role:'ruler',   age:42, dynasty:'왕씨',
      traits:['현명한','외교관'],  stats:{ martial:8,  diplomacy:14, stewardship:11, intrigue:6  }, married_to:2 },
    { id:2,  name:'왕비 류씨',    faction:'고려',     role:'consort', age:36, dynasty:'류씨',
      traits:['인자한'],           stats:{ martial:3,  diplomacy:10, stewardship:8,  intrigue:5  }, married_to:1 },
    { id:3,  name:'왕자 왕성',    faction:'고려',     role:'heir',    age:18, dynasty:'왕씨',
      traits:['용맹한'],           stats:{ martial:11, diplomacy:6,  stewardship:7,  intrigue:4  }, married_to:null },
    { id:4,  name:'대장군 최충',  faction:'고려',     role:'general', age:55, dynasty:'최씨',
      traits:['지략가','노련한'],  stats:{ martial:15, diplomacy:5,  stewardship:7,  intrigue:8  }, married_to:null },

    // ── 북방부족 ──
    { id:5,  name:'대칸 울루크',  faction:'북방부족', role:'ruler',   age:38, dynasty:'울씨',
      traits:['용맹한','잔인한'],  stats:{ martial:16, diplomacy:4,  stewardship:6,  intrigue:7  }, married_to:null },
    { id:6,  name:'부칸 테무르',  faction:'북방부족', role:'heir',    age:20, dynasty:'울씨',
      traits:['용맹한'],           stats:{ martial:13, diplomacy:5,  stewardship:5,  intrigue:4  }, married_to:null },

    // ── 서방상인 ──
    { id:7,  name:'집정관 해리스',faction:'서방상인', role:'ruler',   age:51, dynasty:'해씨',
      traits:['탐욕스러운','교활한'], stats:{ martial:5, diplomacy:10, stewardship:17, intrigue:14 }, married_to:8 },
    { id:8,  name:'부인 마르셀라',faction:'서방상인', role:'consort', age:44, dynasty:'마씨',
      traits:['외교관'],           stats:{ martial:2,  diplomacy:12, stewardship:9,  intrigue:6  }, married_to:7 },
    { id:9,  name:'상단장 카림',  faction:'서방상인', role:'heir',    age:29, dynasty:'해씨',
      traits:['청렴한'],           stats:{ martial:6,  diplomacy:8,  stewardship:14, intrigue:7  }, married_to:null },

    // ── 동방호족 ──
    { id:10, name:'호족장 김동운',faction:'동방호족', role:'ruler',   age:47, dynasty:'김씨',
      traits:['지략가','노련한'],  stats:{ martial:12, diplomacy:8,  stewardship:9,  intrigue:10 }, married_to:null },
    { id:11, name:'장남 김무철',  faction:'동방호족', role:'heir',    age:23, dynasty:'김씨',
      traits:['용맹한'],           stats:{ martial:10, diplomacy:6,  stewardship:7,  intrigue:5  }, married_to:null },

    // ── 남방 ──
    { id:12, name:'제후 이남해',  faction:'남방',     role:'ruler',   age:61, dynasty:'이씨',
      traits:['현명한','병약한'],  stats:{ martial:6,  diplomacy:11, stewardship:13, intrigue:9  }, married_to:null },
    { id:13, name:'세자 이대풍',  faction:'남방',     role:'heir',    age:32, dynasty:'이씨',
      traits:['인자한','외교관'],  stats:{ martial:7,  diplomacy:13, stewardship:10, intrigue:6  }, married_to:null },
  ];

  let nextCharId = 20;

  // ── 접근자 ─────────────────────────────────────────────
  function getAll()           { return characters; }
  function getById(id)        { return characters.find(c => c.id === id); }
  function getByFaction(fid)  { return characters.filter(c => c.faction === fid); }
  function getRuler(fid)      { return characters.find(c => c.faction === fid && c.role === 'ruler'); }
  function getHeir(fid)       { return characters.find(c => c.faction === fid && c.role === 'heir'); }
  function getTrait(name)     { return TRAIT_DEFS[name]; }
  function getAllTraits()      { return TRAIT_DEFS; }

  /**
   * 특성 보정치를 반영한 최종 능력치 반환
   * @param {object} char — 캐릭터 객체
   * @returns {{ martial, diplomacy, stewardship, intrigue }}
   */
  function getEffectiveStats(char) {
    const s = { ...char.stats };
    char.traits.forEach(t => {
      const def = TRAIT_DEFS[t];
      if (!def) return;
      Object.entries(def.effects).forEach(([k, v]) => { s[k] = (s[k] || 0) + v; });
    });
    return s;
  }

  // ── 연 틱 (GameCore 'newYear' 이벤트에 연결) ──────────
  function onYearTick() {
    characters.forEach(c => { c.age++; });
    _checkDeaths();
  }

  // ── 사망 체크 ─────────────────────────────────────────
  function _checkDeaths() {
    const dead = [];
    characters = characters.filter(c => {
      // 비전투 역할만 자연사 체크 (consort 제외)
      const checkRoles = ['ruler', 'heir', 'general', 'advisor'];
      if (!checkRoles.includes(c.role)) return true;

      let deathChance =
        c.age >= 75 ? 0.25 :
        c.age >= 65 ? 0.10 :
        c.age >= 55 ? 0.04 :
        c.age >= 45 ? 0.015 : 0.005;

      if (c.traits.includes('병약한')) deathChance *= 2.5;

      if (Math.random() < deathChance) { dead.push(c); return false; }
      return true;
    });

    dead.forEach(c => {
      if (c.role === 'ruler') {
        Notifications.push(`⚠ ${c.faction}: ${c.name} 붕어 (향년 ${c.age}세)`, 'alert');
        _succeedRuler(c.faction);
      } else if (c.role === 'heir') {
        Notifications.push(`⚠ ${c.faction}: 후계자 ${c.name} 사망`, 'warn');
      } else {
        Notifications.push(`${c.faction}: ${c.name} 사망 (${c.age}세)`);
      }
    });
  }

  // ── 계승 ──────────────────────────────────────────────
  function _succeedRuler(factionId) {
    const heir = getHeir(factionId);
    if (heir) {
      heir.role = 'ruler';
      Notifications.push(`✓ ${factionId}: ${heir.name} 즉위`, 'good');
      characters.push(_generateHeir(factionId, heir));
    } else {
      // 후계자 없음 → 안정도 타격
      const fs = FactionManager.getAllFactionStates()[factionId];
      if (fs) fs.stability = Math.max(0, fs.stability - 30);
      Notifications.push(`⚠ ${factionId}: 후계자 없음! 안정도 대폭 하락`, 'alert');
      characters.push(_generateRuler(factionId));
    }
  }

  function _generateHeir(factionId, parent) {
    const traitPool = Object.keys(TRAIT_DEFS);
    const traits    = [traitPool[Math.floor(Math.random() * traitPool.length)]];
    const id        = nextCharId++;
    return {
      id, name: `${parent.dynasty} 세자`, faction: factionId, role: 'heir',
      age: Math.floor(Math.random() * 10) + 10, dynasty: parent.dynasty,
      traits,
      stats: {
        martial:     Math.floor(Math.random() * 8) + 5,
        diplomacy:   Math.floor(Math.random() * 8) + 5,
        stewardship: Math.floor(Math.random() * 8) + 5,
        intrigue:    Math.floor(Math.random() * 6) + 3,
      },
      married_to: null,
    };
  }

  function _generateRuler(factionId) {
    return {
      id: nextCharId++, name: '신군주', faction: factionId, role: 'ruler',
      age:   30 + Math.floor(Math.random() * 15),
      dynasty: '신왕조',
      traits: ['현명한'],
      stats:  { martial:8, diplomacy:8, stewardship:8, intrigue:5 },
      married_to: null,
    };
  }

  // ── 혼인 ──────────────────────────────────────────────
  /**
   * 두 캐릭터를 혼인 처리. 다른 세력이면 관계도 +15.
   * @returns {boolean} 성공 여부
   */
  function marry(charId1, charId2) {
    const c1 = getById(charId1);
    const c2 = getById(charId2);
    if (!c1 || !c2) return false;

    if (c1.faction !== c2.faction) {
      FactionManager.modRelation(c1.faction, c2.faction, 15);
      Notifications.push(`💒 ${c1.name} ↔ ${c2.name} 혼인 동맹`, 'good');
    }
    c1.married_to = charId2;
    c2.married_to = charId1;
    return true;
  }

  return {
    getAll, getById, getByFaction, getRuler, getHeir,
    getTrait, getAllTraits, getEffectiveStats,
    onYearTick, marry,
  };
})();
