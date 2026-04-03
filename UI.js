/**
 * UI — 사이드패널 & 정보 표시 (M04/M05 통합)
 * 프로빈스 패널(3탭), 세력 목록 패널, 공통 헬퍼
 *
 * 의존 모듈: M03_ProvinceManager, M04_FactionManager, M05_CharacterManager
 * 공개 API:
 *   UI.showProvince(p)      — 프로빈스 패널 표시 (기본/세력/군주 탭)
 *   UI.clearProvince()      — 패널 초기화 (빈 상태)
 *   UI.showFactionPanel()   — 세력 목록 패널 표시
 *   UI._switchProvTab(btn, targetId) — 프로빈스 탭 전환 (onclick에서 직접 호출)
 */
"use strict";

const UI = (() => {

  // ── 상수 ────────────────────────────────────────────────
  const TERRAIN_COLORS = {
    tundra:'#8abcdc', plains:'#6aab3a', forest:'#2e7d32',
    mountain:'#8d6e63', coast:'#26c6da', hills:'#81c784',
    swamp:'#66bb6a', island:'#4dd0e1',
  };

  const BUILDING_ICONS = {
    '교역소':'🏪','항구':'⚓','요새':'🏰','성벽':'🧱','시장':'🏬',
    '농장':'🌾','목장':'🐎','채굴장':'⛏','제련소':'🔥','사원':'⛩',
    '창고':'📦','학당':'📚','목재소':'🪓','어항':'🎣','약재소':'🌿',
    '변경초소':'👁','왕궁':'👑',
  };

  const STAT_ICONS = { martial:'⚔', diplomacy:'🕊', stewardship:'💰', intrigue:'🕵' };
  const STAT_KO    = { martial:'무력', diplomacy:'외교', stewardship:'행정', intrigue:'음모' };

  const ROLE_LABELS    = { ruler:'군주', heir:'후계자', general:'장군', advisor:'참모', consort:'배우자' };
  const ROLE_PORTRAITS = { ruler:'👑', heir:'🎖', general:'⚔', advisor:'📜', consort:'💒' };

  // ── 공통 헬퍼 ───────────────────────────────────────────
  function _setHeader(icon, title) {
    document.getElementById('sidebar-title-icon').textContent = icon;
    document.getElementById('sidebar-title').textContent      = title;
  }

  function _hideAll() {
    document.getElementById('empty-hint').style.display    = 'none';
    document.getElementById('province-panel').style.display = 'none';
    document.getElementById('faction-panel').style.display  = 'none';
  }

  // ── 캐릭터 카드 HTML 생성 ──────────────────────────────
  function _charCardHTML(char) {
    if (!char) return '<div style="color:#445;font-size:11px;padding:4px">—</div>';

    const stats     = CharacterManager.getEffectiveStats(char);
    const fDef      = ProvinceManager.getFaction(char.faction);
    const borderCol = fDef ? fDef.color : '#334';

    const traitsHTML = char.traits.map(t => {
      const def = CharacterManager.getTrait(t);
      const cls = def ? `trait-badge ${def.type}` : 'trait-badge';
      return `<span class="${cls}" title="${def?.desc || ''}">${def?.icon || ''} ${t}</span>`;
    }).join('');

    const statsHTML = Object.keys(STAT_ICONS).map(k =>
      `<span class="stat-chip" title="${STAT_KO[k]}">${STAT_ICONS[k]}<span>${stats[k] || 0}</span></span>`
    ).join('');

    const spouse     = char.married_to ? CharacterManager.getById(char.married_to) : null;
    const spouseLine = spouse
      ? `<div style="font-size:10px;color:#5a7a9a;margin-top:3px">💒 ${spouse.name}</div>` : '';

    return `
      <div class="char-card">
        <div class="char-card-top">
          <div class="char-portrait" style="border-color:${borderCol};background:${borderCol}22">
            ${ROLE_PORTRAITS[char.role] || '👤'}
          </div>
          <div class="char-main">
            <div class="char-name">${char.name}</div>
            <div class="char-role">${ROLE_LABELS[char.role] || char.role} · ${char.dynasty}</div>
            <div class="char-age">나이 ${char.age}세</div>
            ${spouseLine}
          </div>
        </div>
        <div class="char-stats">${statsHTML}</div>
        <div class="trait-list">${traitsHTML}</div>
      </div>`;
  }

  // ── 관계도 바 HTML 생성 ───────────────────────────────
  function _relBarHTML(factionId, otherId) {
    const val  = FactionManager.getRelation(factionId, otherId);
    const lbl  = FactionManager.getRelationLabel(val);
    const fDef = ProvinceManager.getFaction(otherId);
    const name = fDef ? fDef.name : otherId;
    const pct  = Math.round(((val + 100) / 200) * 100);
    const fill = val >= 0 ? '#4ecf8a' : '#e94560';

    return `
      <div class="rel-bar-wrap">
        <span class="rel-label" title="${name}">${name}</span>
        <div class="rel-bar-bg">
          <div class="rel-bar-fill" style="width:${pct}%;background:${fill}"></div>
        </div>
        <span class="rel-value" style="color:${lbl.color}">${lbl.text}</span>
      </div>`;
  }

  // ── 프로빈스 패널 ─────────────────────────────────────
  function showProvince(p) {
    const f   = ProvinceManager.getFaction(p.faction);
    const t   = ProvinceManager.getTerrain(p.terrain);
    const tc  = TERRAIN_COLORS[p.terrain] || '#888';
    const fs  = FactionManager.getFactionState(p.faction);
    const ruler = CharacterManager.getRuler(p.faction);
    const heir  = CharacterManager.getHeir(p.faction);

    _hideAll();
    _setHeader(t?.icon || '🗺', p.name);

    const panel = document.getElementById('province-panel');
    panel.style.display = 'block';

    panel.innerHTML = `
      <div class="panel-tab-row">
        <div class="panel-tab active" onclick="UI._switchProvTab(this,'prov-basic')">기본</div>
        <div class="panel-tab" onclick="UI._switchProvTab(this,'prov-faction')">세력</div>
        <div class="panel-tab" onclick="UI._switchProvTab(this,'prov-ruler')">군주</div>
      </div>

      <!-- ── 기본 탭 ── -->
      <div id="prov-basic">
        <div class="info-section">
          <h4>기본 정보</h4>
          <div class="info-row"><span class="label">지형</span>
            <span class="value"><span class="terrain-badge" style="background:${tc}22;color:${tc};border:1px solid ${tc}44">${t?.icon} ${t?.name}</span></span></div>
          <div class="info-row"><span class="label">지배 세력</span>
            <span class="value"><span class="faction-dot" style="background:${f?.color||'#555'}"></span>${f?.name||'미지'}</span></div>
          <div class="info-row"><span class="label">인구</span>
            <span class="value">${p.population.toLocaleString()}명</span></div>
          <div class="info-row"><span class="label">개발도</span>
            <span class="value">${'★'.repeat(p.development)}${'☆'.repeat(Math.max(0,8-p.development))} (${p.development}/8)</span></div>
          <div class="info-row"><span class="label">세금 보정</span>
            <span class="value">×${t?.taxMod.toFixed(1)}</span></div>
          <div class="info-row"><span class="label">방어 보정</span>
            <span class="value">×${t?.defMod.toFixed(1)}</span></div>
        </div>
        <div class="info-section">
          <h4>자원</h4>
          <div style="padding:4px 0">
            ${p.resources.map(r => `<span class="resource-tag">⬡ ${r}</span>`).join('') || '없음'}
          </div>
        </div>
        <div class="info-section">
          <h4>건물 (${p.buildings.length})</h4>
          ${p.buildings.map(b =>
            `<div class="building-item"><span class="building-icon">${BUILDING_ICONS[b]||'🔹'}</span><span>${b}</span></div>`
          ).join('') || '<div style="color:#445;font-size:11px">없음</div>'}
        </div>
      </div>

      <!-- ── 세력 탭 ── -->
      <div id="prov-faction" style="display:none">
        ${f && fs ? `
        <div class="info-section">
          <h4>${f.name}</h4>
          <div style="color:#7090a0;font-size:11px;line-height:1.6;margin-bottom:8px">${f.description}</div>
          <div class="info-row"><span class="label">총 프로빈스</span>
            <span class="value">${ProvinceManager.getFactionProvinces(p.faction).length}개</span></div>
          <div class="info-row"><span class="label">총 인구</span>
            <span class="value">${(ProvinceManager.getFactionPopulation(p.faction)/10000).toFixed(0)}만명</span></div>
          <div class="info-row"><span class="label">💰 금화</span>
            <span class="value" style="color:#f5a623">${fs.gold.toLocaleString()}</span></div>
          <div class="info-row"><span class="label">📈 월수입</span>
            <span class="value" style="color:#4ecf8a">+${fs.income}</span></div>
          <div class="info-row"><span class="label">📉 월지출</span>
            <span class="value" style="color:#e94560">-${fs.expenses}</span></div>
          <div class="info-row"><span class="label">⭐ 위신</span>
            <span class="value">${fs.prestige.toFixed(0)}/100</span></div>
          <div class="info-row"><span class="label">🏛 안정도</span>
            <span class="value">${fs.stability.toFixed(0)}/100</span></div>
        </div>
        <div class="info-section">
          <h4>타 세력 관계도</h4>
          ${Object.keys(ProvinceManager.getFactions())
            .filter(fid => fid !== p.faction && fid !== '미지')
            .map(fid => _relBarHTML(p.faction, fid))
            .join('')}
        </div>` : '<div style="color:#445;padding:12px">세력 정보 없음</div>'}
      </div>

      <!-- ── 군주 탭 ── -->
      <div id="prov-ruler" style="display:none">
        <div class="info-section">
          <h4>현 군주</h4>${_charCardHTML(ruler)}
        </div>
        <div class="info-section">
          <h4>후계자</h4>${_charCardHTML(heir)}
        </div>
      </div>
    `;
  }

  // ── 탭 전환 ───────────────────────────────────────────
  function _switchProvTab(btn, targetId) {
    document.getElementById('province-panel')
      .querySelectorAll('.panel-tab')
      .forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    ['prov-basic', 'prov-faction', 'prov-ruler'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === targetId ? 'block' : 'none';
    });
  }

  // ── 세력 목록 패널 ────────────────────────────────────
  function showFactionPanel() {
    _hideAll();
    _setHeader('⚔', '세력 목록');

    const panel = document.getElementById('faction-panel');
    panel.style.display = 'block';

    const list = document.getElementById('faction-list');
    list.innerHTML = '';

    Object.values(ProvinceManager.getFactions())
      .filter(f => f.id !== '미지')
      .forEach(f => {
        const provs = ProvinceManager.getFactionProvinces(f.id);
        const pop   = ProvinceManager.getFactionPopulation(f.id);
        const fs    = FactionManager.getFactionState(f.id);
        const ruler = CharacterManager.getRuler(f.id);
        const net   = fs ? (fs.income - fs.expenses) : 0;

        const item = document.createElement('div');
        item.className = 'faction-item';
        item.style.flexDirection = 'column';
        item.style.alignItems    = 'flex-start';
        item.style.gap           = '5px';

        item.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;width:100%">
            <div class="faction-color-bar" style="background:${f.color}"></div>
            <div class="faction-info" style="flex:1">
              <div class="faction-name" style="color:${f.color}">${f.name}</div>
              <div class="faction-stats">${ruler?.name||'?'} | 프로빈스 ${provs.length}개 | ${(pop/10000).toFixed(0)}만명</div>
            </div>
            ${fs ? `<div style="text-align:right;font-size:10px;color:#5a7a6a">
              💰${fs.gold.toLocaleString()}<br>
              <span style="color:${net>=0?'#4ecf8a':'#e94560'}">${net>=0?'+':''}${net.toFixed(0)}/월</span>
            </div>` : ''}
          </div>
          ${fs ? `<div style="display:flex;gap:6px;width:100%;padding-left:12px">
            <div style="flex:1">
              <div style="font-size:9px;color:#445;margin-bottom:2px">위신 ${fs.prestige.toFixed(0)}</div>
              <div style="height:4px;background:#0a1020;border-radius:2px;overflow:hidden">
                <div style="width:${fs.prestige}%;height:100%;background:#f5a623;border-radius:2px"></div>
              </div>
            </div>
            <div style="flex:1">
              <div style="font-size:9px;color:#445;margin-bottom:2px">안정도 ${fs.stability.toFixed(0)}</div>
              <div style="height:4px;background:#0a1020;border-radius:2px;overflow:hidden">
                <div style="width:${fs.stability}%;height:100%;background:${fs.stability>50?'#4ecf8a':'#e94560'};border-radius:2px"></div>
              </div>
            </div>
          </div>` : ''}
        `;

        item.addEventListener('click', () => {
          if (f.capital) {
            const cap = ProvinceManager.getById(f.capital);
            if (cap) showProvince(cap);
          }
        });

        list.appendChild(item);
      });
  }

  function clearProvince() {
    _setHeader('🗺', '프로빈스를 클릭하세요');
    document.getElementById('empty-hint').style.display    = 'block';
    document.getElementById('province-panel').style.display = 'none';
    document.getElementById('faction-panel').style.display  = 'none';
  }

  return { showProvince, clearProvince, showFactionPanel, _switchProvTab };
})();
