// Runtime compatibility guards for environments/extensions with partial performance APIs.
(function initRuntimeShims() {
  if (typeof window === 'undefined') return;

  const noop = () => {};

  const ensureMethod = (obj, methodName) => {
    if (!obj) return;
    if (typeof obj[methodName] === 'function') return;

    try {
      Object.defineProperty(obj, methodName, {
        value: noop,
        writable: true,
        configurable: true,
      });
      return;
    } catch {
      // Fall through to assignment fallback.
    }

    try {
      obj[methodName] = noop;
    } catch {
      // Ignore if object is non-writable in this environment.
    }
  };

  const perf = window.performance;

  // Patch performance object methods when missing.
  ['mark', 'measure', 'clearMarks', 'clearMeasures'].forEach((method) => {
    ensureMethod(perf, method);
  });

  // Ensure global mgt exists for injected scripts expecting it.
  if (typeof window.mgt !== 'object' || window.mgt === null) {
    window.mgt = {};
  }

  ['mark', 'measure', 'clearMarks', 'clearMeasures'].forEach((method) => {
    if (typeof window.mgt[method] !== 'function') {
      if (perf && typeof perf[method] === 'function') {
        window.mgt[method] = (...args) => perf[method](...args);
      } else {
        window.mgt[method] = noop;
      }
    }
  });
})();
