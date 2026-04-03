/**
 * M01 — GAME CORE
 * 시간흐름, 배속(1×~5×), 일시정지, 이벤트버스, 게임루프
 *
 * 의존 모듈: 없음 (최상위 독립 모듈)
 * 공개 API:
 *   GameCore.start()                   — 게임루프 시작
 *   GameCore.togglePause()             — 일시정지/재개 토글
 *   GameCore.setSpeed(n)               — 배속 설정 (1|2|3|5)
 *   GameCore.getState()                — 현재 날짜/배속 상태 반환
 *   GameCore.on(event, callback)       — 이벤트 리스너 등록
 *   GameCore.emit(event, data)         — 이벤트 발생 (모듈 간 통신)
 *
 * 발생 이벤트:
 *   'tick'     — 매일 { year, month, day, totalDays, speed, paused }
 *   'newMonth' — 월 전환 { year, month }
 *   'newYear'  — 연 전환 { year }
 *   'pauseChange' — 일시정지 상태 변경 { paused }
 *
 * 설계 노트:
 *   - TICK_MS=1000: 1배속 기준 하루=1초(실시간)
 *   - 배속은 누적 ms에 곱해서 여러 틱을 한 프레임에 처리
 *   - requestAnimationFrame 기반 → 탭 비활성화 시 자동 일시정지
 */
"use strict";

const GameCore = (() => {

  const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTH_NAMES    = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const TICK_MS        = 1000; // 1배속: 하루 = 1초

  let state = {
    year:      1200,
    month:     1,
    day:       1,
    totalDays: 0,
    speed:     1,
    paused:    true,
    tick:      0,
  };

  // ── 이벤트 버스 ──────────────────────────────────────
  const listeners = {};

  function on(event, cb) {
    (listeners[event] = listeners[event] || []).push(cb);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(cb => cb(data));
  }

  // ── 날짜 진행 ─────────────────────────────────────────
  let lastTime = null;
  let accumMs  = 0;

  function advanceDay() {
    state.day++;
    state.totalDays++;
    state.tick++;

    const maxDay = DAYS_PER_MONTH[state.month - 1];
    if (state.day > maxDay) {
      state.day = 1;
      state.month++;
      emit('newMonth', { year: state.year, month: state.month });

      if (state.month > 12) {
        state.month = 1;
        state.year++;
        emit('newYear', { year: state.year });
      }
    }

    emit('tick', { ...state });
    _updateDateUI();
  }

  // ── 게임루프 ──────────────────────────────────────────
  function _loop(timestamp) {
    requestAnimationFrame(_loop);
    if (!lastTime) { lastTime = timestamp; return; }

    const dt = timestamp - lastTime;
    lastTime  = timestamp;

    if (!state.paused) {
      accumMs += dt * state.speed;
      while (accumMs >= TICK_MS) {
        accumMs -= TICK_MS;
        advanceDay();
      }
    }

    // 맵 렌더 위임 (MapRenderer가 존재하면 호출)
    if (typeof MapRenderer !== 'undefined') MapRenderer.render();
  }

  // ── UI 업데이트 ───────────────────────────────────────
  function _updateDateUI() {
    const txt = `${state.year}년 ${MONTH_NAMES[state.month - 1]} ${state.day}일`;
    const dateEl = document.getElementById('date-display');
    if (dateEl) dateEl.textContent = txt;

    const sbDate = document.getElementById('status-date');
    if (sbDate) sbDate.textContent =
      `${state.year}.${String(state.month).padStart(2,'0')}.${String(state.day).padStart(2,'0')}`;

    const sbSpeed = document.getElementById('status-speed');
    if (sbSpeed) sbSpeed.textContent =
      state.paused ? '⏸ 일시정지' : `▶ 배속: ${state.speed}×`;
  }

  // ── 공개 제어 ─────────────────────────────────────────
  function togglePause() {
    state.paused = !state.paused;
    const btn = document.getElementById('pause-btn');
    if (btn) {
      btn.textContent = state.paused ? '▶' : '⏸';
      btn.classList.toggle('paused', state.paused);
    }
    _updateDateUI();
    emit('pauseChange', state.paused);
  }

  function setSpeed(s) {
    state.speed = s;
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.speed) === s);
    });
    _updateDateUI();
  }

  function getState() { return { ...state }; }

  function start() {
    requestAnimationFrame(_loop);

    // 키보드 단축키
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      if (e.key === '1') setSpeed(1);
      if (e.key === '2') setSpeed(2);
      if (e.key === '3') setSpeed(3);
      if (e.key === '5') setSpeed(5);
      if (e.key === 'f' || e.key === 'F') {
        if (typeof UI !== 'undefined') UI.showFactionPanel();
      }
    });
  }

  return { start, togglePause, setSpeed, getState, on, emit };
})();
