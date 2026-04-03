/**
 * TIMEBAR — 시간 진행 시각화 바
 * 12개 월 셀(계절 색상) + 일 진행바 + 연도 배지
 *
 * 의존 모듈: M01_GameCore (on 'tick' 이벤트)
 * 공개 API:
 *   TimeBar.update(state) — GameCore state 받아 UI 갱신
 *
 * 계절 색상:
 *   겨울(1,2,12): 파랑  |  봄(3,4,5): 초록
 *   여름(6,7,8): 노랑   |  가을(9,10,11): 주황
 */
"use strict";

const TimeBar = (() => {

  const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTH_SHORT    = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  // 인덱스 0=1월, 11=12월
  const SEASON = [
    'winter','winter','spring','spring','spring',
    'summer','summer','summer','autumn','autumn','autumn','winter',
  ];

  const track    = document.getElementById('month-track');
  const dayFill  = document.getElementById('day-bar-fill');
  const dayText  = document.getElementById('day-bar-text');
  const yearBadge = document.getElementById('year-badge');

  // 셀 12개 미리 생성 (DOM 조작 최소화)
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const cell = document.createElement('div');
    cell.className = `month-cell season-${SEASON[i]}`;
    cell.title     = MONTH_SHORT[i];
    cell.innerHTML = `
      <div class="month-cell-bg"></div>
      <div class="month-cell-fill"></div>
      <div class="month-cell-label">${MONTH_SHORT[i]}</div>
    `;
    track.appendChild(cell);
    cells.push(cell);
  }

  function update({ year, month, day }) {
    yearBadge.textContent = `${year}년`;

    for (let i = 0; i < 12; i++) {
      const m    = i + 1;
      const cell = cells[i];
      const fill = cell.querySelector('.month-cell-fill');

      cell.classList.remove('past', 'current', 'future');

      if (m < month) {
        cell.classList.add('past');
        fill.style.width     = '100%';
        fill.style.opacity   = '0.6';
        fill.style.animation = 'none';
      } else if (m === month) {
        const pct = Math.round((day / DAYS_PER_MONTH[i]) * 100);
        cell.classList.add('current');
        fill.style.width     = pct + '%';
        fill.style.opacity   = '1';
        fill.style.animation = '';  // CSS shimmer 재개
      } else {
        cell.classList.add('future');
        fill.style.width     = '0%';
        fill.style.opacity   = '0';
        fill.style.animation = 'none';
      }
    }

    // 일 진행바
    const maxDay = DAYS_PER_MONTH[month - 1];
    const pct    = Math.max(3, Math.round((day / maxDay) * 100));
    dayFill.style.width = pct + '%';
    dayText.textContent = `${day}/${maxDay}`;
  }

  return { update };
})();
