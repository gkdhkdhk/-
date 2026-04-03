/**
 * M03 — PROVINCE MANAGER
 * 프로빈스 데이터, 지형 정의, 세력 정의, 데이터 접근 API
 *
 * 의존 모듈: 없음
 * 공개 API:
 *   ProvinceManager.getAll()                    — 전체 프로빈스 배열
 *   ProvinceManager.getById(id)                 — ID로 프로빈스 조회
 *   ProvinceManager.getByPickColor(hex)          — 피킹 색상으로 프로빈스 조회
 *   ProvinceManager.getFactions()               — 전체 세력 맵 { id → faction }
 *   ProvinceManager.getFaction(id)              — 세력 조회
 *   ProvinceManager.getTerrain(id)              — 지형 조회
 *   ProvinceManager.getTerrains()              — 전체 지형 맵
 *   ProvinceManager.getFactionProvinces(fid)    — 세력 소속 프로빈스 배열
 *   ProvinceManager.getFactionPopulation(fid)   — 세력 총 인구
 *
 * 데이터 구조:
 *   Province { id, name, faction, terrain, resources[], buildings[],
 *              population, development(1-8), pickColor, poly[[x,y]...] }
 *   Faction  { id, name, color, ruler, capital(provinceId), description }
 *   Terrain  { name, color, icon, taxMod, defMod }
 *
 * 확장 방법:
 *   PROVINCES_DATA 배열에 항목 추가하거나
 *   editor.html에서 JSON 내보내기 후 PROVINCES_DATA를 교체하세요.
 */
"use strict";

const ProvinceManager = (() => {

  // ── 세력 정의 ──────────────────────────────────────────
  // color: 맵 정치 모드 표시색 (16진수)
  // capital: 수도 프로빈스 id
  const FACTIONS = {
    "고려": {
      id: "고려", name: "고려국", color: "#2563c7",
      ruler: "왕 건 2세", capital: 6,
      description: "중원의 강국. 안정된 경제와 강한 관료제."
    },
    "북방부족": {
      id: "북방부족", name: "북방 부족 연맹", color: "#8b4513",
      ruler: "대칸 울루크", capital: 1,
      description: "초원의 유목 전사들. 기병 중심 군사력."
    },
    "서방상인": {
      id: "서방상인", name: "서방 상인 공화국", color: "#c6a800",
      ruler: "집정관 해리스", capital: 4,
      description: "교역으로 부를 쌓은 해안 도시국가."
    },
    "동방호족": {
      id: "동방호족", name: "동방 호족 연합", color: "#1a8a5a",
      ruler: "호족장 김동운", capital: 8,
      description: "산악 지형에 적응한 독립적 호족들."
    },
    "남방": {
      id: "남방", name: "남방 제후국", color: "#9b59b6",
      ruler: "제후 이남해", capital: 12,
      description: "비옥한 남부를 지배하는 제후들."
    },
    "미지": {
      id: "미지", name: "미지의 땅", color: "#445566",
      ruler: "—", capital: null,
      description: "아직 확인되지 않은 지역."
    }
  };

  // ── 지형 정의 ──────────────────────────────────────────
  // taxMod: 세금 보정 배율  |  defMod: 방어 보정 배율
  const TERRAINS = {
    tundra:   { name:"동토", color:"#b8d4e8", icon:"🌨", taxMod:0.3, defMod:1.0 },
    plains:   { name:"평원", color:"#8bc34a", icon:"🌾", taxMod:1.2, defMod:0.8 },
    forest:   { name:"삼림", color:"#2e7d32", icon:"🌲", taxMod:0.9, defMod:1.3 },
    mountain: { name:"산악", color:"#795548", icon:"⛰", taxMod:0.6, defMod:1.8 },
    coast:    { name:"해안", color:"#26c6da", icon:"🌊", taxMod:1.1, defMod:0.9 },
    hills:    { name:"구릉", color:"#a5d6a7", icon:"🏔", taxMod:0.8, defMod:1.4 },
    swamp:    { name:"습지", color:"#66bb6a", icon:"🌿", taxMod:0.5, defMod:1.5 },
    island:   { name:"섬",   color:"#80deea", icon:"🏝", taxMod:0.9, defMod:1.2 },
  };

  // ── 프로빈스 데이터 ────────────────────────────────────
  // poly: 캔버스 좌표 폴리곤 [x,y] 배열 (맵 기준 좌표계, 900×780 기준)
  // pickColor: 오프스크린 색상 피킹용 고유 색상 (#RRGGBB)
  // development: 1~8 (높을수록 부유)
  const PROVINCES_DATA = [
    {
      id:1, name:"설원", faction:"북방부족", terrain:"tundra",
      resources:["모피","목재","말"], population:42000,
      buildings:["교역소"], development:1,
      pickColor:"#010000",
      poly:[[0,0],[240,0],[260,100],[200,160],[120,180],[0,160]]
    },
    {
      id:2, name:"철령", faction:"북방부족", terrain:"mountain",
      resources:["철광","석재","구리"], population:61000,
      buildings:["제련소","요새"], development:2,
      pickColor:"#020000",
      poly:[[240,0],[460,0],[440,90],[380,130],[300,150],[260,100]]
    },
    {
      id:3, name:"북관", faction:"북방부족", terrain:"plains",
      resources:["말","곡물"], population:88000,
      buildings:["목장","농장"], development:2,
      pickColor:"#030000",
      poly:[[460,0],[700,0],[680,80],[620,140],[520,160],[440,90]]
    },
    {
      id:4, name:"황해도", faction:"서방상인", terrain:"coast",
      resources:["어류","소금","교역품"], population:130000,
      buildings:["항구","교역소","창고"], development:4,
      pickColor:"#040000",
      poly:[[0,160],[120,180],[100,280],[60,340],[0,360]]
    },
    {
      id:5, name:"서경", faction:"서방상인", terrain:"plains",
      resources:["곡물","교역품","직물"], population:210000,
      buildings:["시장","항구","성벽","교역소"], development:5,
      pickColor:"#050000",
      poly:[[120,180],[200,160],[280,190],[260,280],[180,300],[100,280]]
    },
    {
      id:6, name:"한성", faction:"고려", terrain:"plains",
      resources:["곡물","직물","도자기"], population:380000,
      buildings:["왕궁","성벽","시장","사원","학당"], development:8,
      pickColor:"#060000",
      poly:[[200,160],[300,150],[380,130],[400,220],[360,290],[280,310],[260,280],[280,190]]
    },
    {
      id:7, name:"개성", faction:"고려", terrain:"hills",
      resources:["인삼","교역품","도자기"], population:165000,
      buildings:["교역소","시장","성벽"], development:6,
      pickColor:"#070000",
      poly:[[60,340],[100,280],[180,300],[160,400],[80,420],[20,400]]
    },
    {
      id:8, name:"동경", faction:"동방호족", terrain:"forest",
      resources:["목재","사냥감","약초"], population:94000,
      buildings:["목재소","요새"], development:3,
      pickColor:"#080000",
      poly:[[520,160],[620,140],[680,80],[700,0],[820,0],[840,120],[760,180],[680,220],[600,230],[540,210]]
    },
    {
      id:9, name:"강원", faction:"동방호족", terrain:"mountain",
      resources:["철광","석재","약초"], population:72000,
      buildings:["채굴장","요새"], development:2,
      pickColor:"#090000",
      poly:[[380,130],[440,90],[520,160],[540,210],[480,250],[420,240],[400,220]]
    },
    {
      id:10, name:"변경", faction:"동방호족", terrain:"hills",
      resources:["말","모피","사냥감"], population:55000,
      buildings:["변경초소"], development:2,
      pickColor:"#0a0000",
      poly:[[700,0],[900,0],[900,120],[840,120],[820,0]]
    },
    {
      id:11, name:"금강", faction:"고려", terrain:"plains",
      resources:["곡물","금","도자기"], population:195000,
      buildings:["농장","채굴장","사원"], development:6,
      pickColor:"#0b0000",
      poly:[[160,400],[280,310],[360,290],[400,220],[420,240],[480,250],[460,360],[380,420],[260,440],[180,430]]
    },
    {
      id:12, name:"광주", faction:"남방", terrain:"plains",
      resources:["곡물","면화","도자기"], population:178000,
      buildings:["농장","시장","성벽"], development:5,
      pickColor:"#0c0000",
      poly:[[80,420],[160,400],[180,430],[200,520],[120,540],[40,510],[20,440]]
    },
    {
      id:13, name:"전주", faction:"고려", terrain:"plains",
      resources:["쌀","곡물","견직물"], population:220000,
      buildings:["농장","농장","창고","사원"], development:7,
      pickColor:"#0d0000",
      poly:[[180,430],[260,440],[380,420],[400,520],[320,560],[200,560],[120,540],[200,520]]
    },
    {
      id:14, name:"남해", faction:"남방", terrain:"coast",
      resources:["어류","소금","진주"], population:108000,
      buildings:["항구","어항"], development:4,
      pickColor:"#0e0000",
      poly:[[200,560],[320,560],[400,520],[460,560],[420,620],[300,640],[160,620],[120,580]]
    },
    {
      id:15, name:"탐라", faction:"남방", terrain:"island",
      resources:["귤","말","어류"], population:48000,
      buildings:["항구"], development:3,
      pickColor:"#0f0000",
      poly:[[320,680],[420,680],[440,740],[360,760],[280,740]]
    },
    {
      id:16, name:"동해안", faction:"동방호족", terrain:"coast",
      resources:["어류","소금","목재"], population:86000,
      buildings:["항구","교역소"], development:3,
      pickColor:"#100000",
      poly:[[760,180],[840,120],[900,120],[900,300],[820,280],[760,250],[680,220]]
    },
    {
      id:17, name:"남원", faction:"남방", terrain:"hills",
      resources:["약초","목재","석재"], population:92000,
      buildings:["약재소","목재소"], development:3,
      pickColor:"#110000",
      poly:[[380,420],[460,360],[540,380],[520,480],[440,520],[400,520]]
    },
    {
      id:18, name:"울산", faction:"동방호족", terrain:"coast",
      resources:["철광","어류","교역품"], population:115000,
      buildings:["항구","제련소","성벽"], development:4,
      pickColor:"#120000",
      poly:[[480,250],[540,210],[600,230],[680,220],[760,250],[820,280],[900,300],[900,440],[820,420],[720,380],[620,340],[540,380],[460,360]]
    },
  ];

  // ── 인덱스 구축 ────────────────────────────────────────
  const byId        = {};
  const byPickColor = {};
  PROVINCES_DATA.forEach(p => {
    byId[p.id]               = p;
    byPickColor[p.pickColor] = p;
  });

  // ── 상태바 초기화 ──────────────────────────────────────
  const sbProv = document.getElementById('status-provinces');
  const sbFact = document.getElementById('status-factions');
  if (sbProv) sbProv.textContent = `프로빈스: ${PROVINCES_DATA.length}`;
  if (sbFact) sbFact.textContent = `세력: ${Object.keys(FACTIONS).length - 1}`;

  // ── 공개 API ───────────────────────────────────────────
  function getAll()              { return PROVINCES_DATA; }
  function getById(id)           { return byId[id]; }
  function getByPickColor(hex)   { return byPickColor[hex] || null; }
  function getFactions()         { return FACTIONS; }
  function getFaction(id)        { return FACTIONS[id]; }
  function getTerrain(id)        { return TERRAINS[id]; }
  function getTerrains()         { return TERRAINS; }

  function getFactionProvinces(fid) {
    return PROVINCES_DATA.filter(p => p.faction === fid);
  }

  function getFactionPopulation(fid) {
    return getFactionProvinces(fid).reduce((s, p) => s + p.population, 0);
  }

  return {
    getAll, getById, getByPickColor,
    getFactions, getFaction, getTerrain, getTerrains,
    getFactionProvinces, getFactionPopulation,
  };
})();
