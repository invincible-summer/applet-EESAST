/**
 * 页面级轮询器：替代 Web 端 GraphQL Subscription
 * 页面在自身 onShow/onHide/onUnload 中调用 start()/stop()/destroy()
 */
function createPoller(fn, interval) {
  let timer = null;
  let running = false;
  let inFlight = false;

  function tick() {
    if (inFlight) return;
    inFlight = true;
    Promise.resolve()
      .then(fn)
      .catch(() => {})
      .then(() => {
        inFlight = false;
      });
  }

  return {
    start(immediate) {
      if (running) {
        return;
      }
      running = true;
      if (immediate !== false) tick();
      timer = setInterval(tick, interval);
    },
    stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    trigger: tick,
    destroy() {
      this.stop();
    }
  };
}

module.exports = { createPoller };
