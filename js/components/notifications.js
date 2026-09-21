/* ============================================================
   notifications.js — Toast notification system
   ============================================================ */

window.CF = window.CF || {};

CF.Notify = (() => {
  const container = () => document.getElementById('toasts');

  function show(message, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span style="font-size:14px">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;
    container().appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove());
    }, duration);
  }

  return {
    success: (msg, dur)  => show(msg, 'success', dur),
    error:   (msg, dur)  => show(msg, 'error',   dur || 6000),
    info:    (msg, dur)  => show(msg, 'info',    dur),
  };
})();
