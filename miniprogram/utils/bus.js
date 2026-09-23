/**
 * 轻量事件总线：跨页面通信（登录态变化等）
 */
const listeners = {};

function on(event, handler) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(handler);
  // 返回取消函数
  return function off() {
    const arr = listeners[event] || [];
    const idx = arr.indexOf(handler);
    if (idx >= 0) arr.splice(idx, 1);
  };
}

function emit(event, payload) {
  (listeners[event] || []).slice().forEach((handler) => {
    try {
      handler(payload);
    } catch (e) {
      console.error("[bus] handler error:", e);
    }
  });
}

module.exports = { on, emit };
