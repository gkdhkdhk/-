/**
 * NOTIFICATIONS — 인게임 알림 피드
 * 맵 우하단에 최대 5개 알림을 스택으로 표시, 5초 후 자동 소멸
 *
 * 의존 모듈: 없음 (DOM에 직접 접근)
 * 공개 API:
 *   Notifications.init()              — 피드 컨테이너 생성 (load 시 1회 호출)
 *   Notifications.push(msg, type)     — 알림 추가
 *     type: '' | 'warn' | 'alert' | 'good'
 *
 * CSS 클래스:
 *   .notif-item        — 기본 (파란 왼쪽 테두리)
 *   .notif-item.warn   — 경고 (주황)
 *   .notif-item.alert  — 위험 (빨강)
 *   .notif-item.good   — 좋음 (초록)
 */
"use strict";

const Notifications = (() => {
  let feed = null;

  function init() {
    feed = document.createElement('div');
    feed.id = 'notif-feed';
    const wrap = document.getElementById('canvas-wrap');
    if (wrap) wrap.appendChild(feed);
  }

  function push(msg, type = '') {
    if (!feed) return;
    const el       = document.createElement('div');
    el.className   = 'notif-item' + (type ? ` ${type}` : '');
    el.textContent = msg;
    feed.prepend(el);
    // 5.5초 후 제거
    setTimeout(() => el.remove(), 5500);
    // 최대 5개 유지
    while (feed.children.length > 5) feed.lastChild?.remove();
  }

  return { init, push };
})();
