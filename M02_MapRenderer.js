/**
 * M02 — MAP RENDERER
 * Canvas 기반 폴리곤 맵 렌더링, 색상 피킹, 클릭/호버 감지, 맵 모드
 *
 * 의존 모듈: M01_GameCore, M03_ProvinceManager
 * 공개 API:
 *   MapRenderer.init()          — 캔버스 초기화 및 이벤트 등록
 *   MapRenderer.render()        — 프레임 렌더 (GameCore 루프에서 매 프레임 호출)
 *   MapRenderer.setMode(mode)   — 맵 모드 전환 ('political'|'terrain'|'population'|'resources')
 *   MapRenderer.markDirty()     — 다음 프레임 강제 재렌더
 *
 * 렌더링 방식:
 *   - 메인 캔버스: 사용자에게 보이는 실제 렌더
 *   - 오프스크린 피킹 캔버스: 각 프로빈스를 pickColor로 채워 픽셀 색상으로 클릭 감지
 *   - dirty flag: 변경 없을 때 렌더 스킵으로 성능 최적화
 *
 * 조작:
 *   - 좌클릭: 프로빈스 선택
 *   - 마우스 휠: 줌 (0.5×~3.0×)
 *   - 우클릭 드래그: 맵 패닝
 *
 * 맵 모드별 색상:
 *   political  — 세력 색상
 *   terrain    — 지형 고유 색상
 *   population — 인구 밀도 (파랑→빨강)
 *   resources  — 개발도 (어두운→밝은 녹색)
 */
"use strict";

const MapRenderer = (() => {

  const canvas     = document.getElementById('gameCanvas');
  const ctx        = canvas.getContext('2d');
  const tooltip    = document.getElementById('map-tooltip');

  // 오프스크린 피킹 캔버스
  const pickCanvas = document.createElement('canvas');
  const pickCtx    = pickCanvas.getContext('2d', { willReadFrequently: true });

  let currentMode = 'political';
  let selectedId  = null;
  let hoveredId   = null;
  let needsRedraw = true;

  // 뷰 변환
  let scale   = 1.0;
  let offsetX = 30;
  let offsetY = 20;

  // 인구 최대값 (색상 스케일 정규화용)
  const maxPop = Math.max(...ProvinceManager.getAll().map(p => p.population));

  // ── 캔버스 리사이즈 ────────────────────────────────────
  function resize() {
    const wrap = document.getElementById('canvas-wrap');
    canvas.width      = wrap.clientWidth;
    canvas.height     = wrap.clientHeight;
    pickCanvas.width  = canvas.width;
    pickCanvas.height = canvas.height;
    needsRedraw = true;
    _buildPickBuffer();
  }

  // ── 좌표 변환 ─────────────────────────────────────────
  function _transformedPoly(poly) {
    return poly.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY]);
  }

  // ── 폴리곤 그리기 헬퍼 ────────────────────────────────
  function _drawPoly(context, poly, fill, stroke, lineWidth = 1) {
    context.beginPath();
    const tp = _transformedPoly(poly);
    context.moveTo(tp[0][0], tp[0][1]);
    for (let i = 1; i < tp.length; i++) context.lineTo(tp[i][0], tp[i][1]);
    context.closePath();
    if (fill)   { context.fillStyle   = fill;      context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke(); }
  }

  // ── 폴리곤 중심점 ─────────────────────────────────────
  function _polyCenter(poly) {
    let x = 0, y = 0;
    poly.forEach(([px, py]) => { x += px; y += py; });
    return [
      (x / poly.length) * scale + offsetX,
      (y / poly.length) * scale + offsetY,
    ];
  }

  // ── 피킹 버퍼 구축 ────────────────────────────────────
  // 각 프로빈스를 pickColor(고유 색상)로 오프스크린에 그려
  // 클릭 픽셀의 색상 → 프로빈스 ID 매핑
  function _buildPickBuffer() {
    pickCtx.clearRect(0, 0, pickCanvas.width, pickCanvas.height);
    ProvinceManager.getAll().forEach(p => {
      _drawPoly(pickCtx, p.poly, p.pickColor, null);
    });
  }

  // ── 맵 모드별 색상 ────────────────────────────────────
  function _getProvinceColor(p) {
    switch (currentMode) {
      case 'political': {
        const f = ProvinceManager.getFaction(p.faction);
        return f ? f.color : '#445566';
      }
      case 'terrain': {
        const t = ProvinceManager.getTerrain(p.terrain);
        return t ? t.color : '#888';
      }
      case 'population': {
        const ratio = p.population / maxPop;
        return `rgb(${Math.round(255*ratio)},60,${Math.round(255*(1-ratio))})`;
      }
      case 'resources': {
        const g = Math.min(255, 80 + p.development * 22);
        return `rgb(20,${g},40)`;
      }
      default: return '#445566';
    }
  }

  // ── 메인 렌더 ─────────────────────────────────────────
  function render() {
    if (!needsRedraw) return;
    needsRedraw = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 바다 배경
    ctx.fillStyle = '#1a3a5c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 바다 격자 무늬 (미세)
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let x = 0; x < canvas.width; x += 40)
      for (let y = 0; y < canvas.height; y += 40)
        ctx.fillRect(x, y, 20, 1);

    const provinces = ProvinceManager.getAll();

    // Pass 1: 프로빈스 채우기
    provinces.forEach(p => {
      let fill = _getProvinceColor(p);
      if      (p.id === selectedId) fill = _lightenColor(fill, 40);
      else if (p.id === hoveredId)  fill = _lightenColor(fill, 20);
      _drawPoly(ctx, p.poly, fill, null);
    });

    // Pass 2: 테두리
    provinces.forEach(p => {
      const isSel    = p.id === selectedId;
      const stroke   = isSel ? '#fff' : 'rgba(0,0,0,0.6)';
      const lineW    = isSel ? 2.5 : 0.8;
      _drawPoly(ctx, p.poly, null, stroke, lineW);
    });

    // Pass 3: 선택 하이라이트 (점선)
    if (selectedId) {
      const p = ProvinceManager.getById(selectedId);
      if (p) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        _drawPoly(ctx, p.poly, null, '#ffdd44', 2);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Pass 4: 레이블
    provinces.forEach(p => {
      const [cx, cy] = _polyCenter(p.poly);
      if (cx < 0 || cx > canvas.width || cy < 0 || cy > canvas.height) return;

      ctx.save();
      ctx.font = `bold ${Math.max(9, 11 * scale)}px 'Malgun Gothic', sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(p.name, cx + 1, cy + 1);

      // 텍스트
      ctx.fillStyle = p.id === selectedId ? '#ffdd44' : '#ffffff';
      ctx.fillText(p.name, cx, cy);

      // 개발도 점
      if (scale > 0.8) {
        ctx.font      = `${Math.max(7, 8 * scale)}px serif`;
        ctx.fillStyle = '#ffcc44';
        ctx.fillText('●'.repeat(Math.min(p.development, 8)), cx, cy + 12 * scale);
      }
      ctx.restore();
    });

    // 섬 연결선 (탐라 ↔ 남해)
    const tamra  = ProvinceManager.getById(15);
    const nambae = ProvinceManager.getById(14);
    if (tamra && nambae) {
      ctx.save();
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = 'rgba(200,220,255,0.2)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      const [tx, ty] = _polyCenter(tamra.poly);
      const [nx, ny] = _polyCenter(nambae.poly);
      ctx.moveTo(tx, ty); ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 맵 모드 워터마크
    ctx.save();
    ctx.font      = '11px Malgun Gothic';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.textAlign = 'left';
    const modeLabels = { political:'정치 지도', terrain:'지형 지도', population:'인구 지도', resources:'자원 지도' };
    ctx.fillText(modeLabels[currentMode] || '', 8, canvas.height - 8);
    ctx.restore();
  }

  // ── 색상 유틸 ─────────────────────────────────────────
  function _lightenColor(hex, amount) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgb(${Math.min(255,r+amount)},${Math.min(255,g+amount)},${Math.min(255,b+amount)})`;
  }

  // ── 픽셀 → 프로빈스 ──────────────────────────────────
  function _provinceAtPixel(x, y) {
    const pixel = pickCtx.getImageData(x, y, 1, 1).data;
    const hex   = '#' + [pixel[0],pixel[1],pixel[2]].map(v => v.toString(16).padStart(2,'0')).join('');
    return ProvinceManager.getByPickColor(hex);
  }

  // ── 이벤트 등록 ───────────────────────────────────────
  function _initEvents() {
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const p    = _provinceAtPixel(e.clientX - rect.left, e.clientY - rect.top);
      if (p) {
        selectedId = p.id;
        document.getElementById('status-selected').textContent = `선택: ${p.name}`;
        if (typeof UI !== 'undefined') UI.showProvince(p);
      } else {
        selectedId = null;
        document.getElementById('status-selected').textContent = '선택: 없음';
        if (typeof UI !== 'undefined') UI.clearProvince();
      }
      needsRedraw = true;
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const p    = _provinceAtPixel(e.clientX - rect.left, e.clientY - rect.top);
      const newHovered = p ? p.id : null;
      if (newHovered !== hoveredId) { hoveredId = newHovered; needsRedraw = true; }
      if (p) {
        const f = ProvinceManager.getFaction(p.faction);
        const t = ProvinceManager.getTerrain(p.terrain);
        tooltip.style.display = 'block';
        tooltip.style.left    = (e.clientX - rect.left + 14) + 'px';
        tooltip.style.top     = (e.clientY - rect.top  - 10) + 'px';
        tooltip.textContent   = `${p.name} — ${f?.name||'?'} | ${t?.name||'?'} | 인구 ${p.population.toLocaleString()}`;
      } else {
        tooltip.style.display = 'none';
      }
    });

    canvas.addEventListener('mouseleave', () => {
      hoveredId = null; tooltip.style.display = 'none'; needsRedraw = true;
    });

    // 휠 줌
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect     = canvas.getBoundingClientRect();
      const mx       = e.clientX - rect.left;
      const my       = e.clientY - rect.top;
      const delta    = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.5, Math.min(3.0, scale * delta));
      offsetX = mx - (mx - offsetX) * (newScale / scale);
      offsetY = my - (my - offsetY) * (newScale / scale);
      scale   = newScale;
      needsRedraw = true;
      _buildPickBuffer();
    }, { passive: false });

    // 우클릭 드래그 패닝
    let dragging = false, dragStartX, dragStartY;
    canvas.addEventListener('mousedown', e => {
      if (e.button === 2) {
        dragging   = true;
        dragStartX = e.clientX - offsetX;
        dragStartY = e.clientY - offsetY;
      }
    });
    canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      offsetX     = e.clientX - dragStartX;
      offsetY     = e.clientY - dragStartY;
      needsRedraw = true;
      _buildPickBuffer();
    });
    canvas.addEventListener('mouseup',       () => { dragging = false; });
    canvas.addEventListener('contextmenu',   e  => e.preventDefault());
  }

  // ── 공개 API ───────────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.map-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    needsRedraw = true;
  }

  function markDirty() { needsRedraw = true; }

  function init() {
    resize();
    window.addEventListener('resize', resize);
    GameCore.on('tick', () => { needsRedraw = true; });
    _initEvents();
  }

  return { render, setMode, markDirty, init };
})();
