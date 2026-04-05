/**
 * justVIBE — ML API Service Layer
 * Handles all communication with the Python backend.
 */

import axios from 'axios';

const API_BASE = import.meta.env.PROD
  ? 'https://ritanshucse.online'
  : (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:6261');
const TIMEOUT_MS = 30000;

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: TIMEOUT_MS,
});

const MODE_RECOMMEND_TTL_MS = 60_000;
const modeRecommendCache = new Map();
const modeRecommendInflight = new Map();

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function stripHtml(str) {
  // Remove HTML tags and collapse whitespace — avoids dumping raw HTML into UI hints.
  return String(str).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getAxiosErrorMessage(err, data, status) {
  if (!err.response) {
    return `Cannot reach backend service at ${API_BASE}. Please verify backend is running and VITE_API_BASE is correct.`;
  }

  if (status === 429) {
    return 'Rate limited — please wait a moment and try again.';
  }

  if (typeof data === 'string' && data.trim()) {
    // Never surface raw HTML (e.g. nginx error pages) to the user.
    const cleaned = stripHtml(data);
    return cleaned.length < 200 ? cleaned : `Server error (${status}).`;
  }

  if (status >= 500) {
    return `Backend error (${status}). Please try again in a moment.`;
  }

  return data?.message || data?.error || err.message || 'Network error';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(endpoint, options = {}, _retryCount = 0) {
  const method = (options.method || 'GET').toLowerCase();
  const timeout = options.timeout || TIMEOUT_MS;

  const config = {
    url: endpoint,
    method,
    timeout,
    headers: { ...(options.headers || {}) },
  };

  if (options.body != null) {
    if (options.body instanceof FormData) {
      config.data = options.body;
    } else {
      config.data = normalizeBody(options.body);
      config.headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const response = await apiClient.request(config);
    return response?.data ?? {};
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw new ApiError('Request timed out', 408);
      }

      const status = err.response?.status ?? 0;
      const data = err.response?.data;

      // Auto-retry once on 429 with exponential back-off.
      // Respect Retry-After header if present, otherwise use 8s then 20s.
      if (status === 429 && _retryCount < 2) {
        const retryAfterHeader = err.response?.headers?.['retry-after'];
        const waitSec = retryAfterHeader
          ? Math.min(60, Math.max(1, Number(retryAfterHeader)))
          : (_retryCount === 0 ? 8 : 20);
        await sleep(waitSec * 1000);
        return request(endpoint, options, _retryCount + 1);
      }

      const message = getAxiosErrorMessage(err, data, status);
      throw new ApiError(message, status, data);
    }

    if (err?.name === 'AbortError') {
      throw new ApiError('Request timed out', 408);
    }

    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || 'Network error', 0);
  }
}

function normalizeBody(body) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  return body;
}

// ── Health & Status ────────────────────────────────────────────

export async function checkHealth(options = {}) {
  return request('/health', {
    timeout: options.timeout || 10000,
  });
}

export async function getModelStatus(options = {}) {
  return request('/model/status', {
    timeout: options.timeout || 15000,
  });
}

// ── Genre Detection ────────────────────────────────────────────

export async function detectGenre(filePath) {
  return request('/genre/detect', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  });
}

export async function detectGenreFromFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/genre/detect', {
    method: 'POST',
    body: formData,
  });
}

// ── EQ Recommendation ─────────────────────────────────────────

export async function getEQRecommendation(filePath, genre) {
  return request('/eq/recommend', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, genre }),
  });
}

export async function logEQ(trackId, eqSettings, accepted) {
  return request('/eq/log', {
    method: 'POST',
    body: JSON.stringify({ track_id: trackId, eq_settings: eqSettings, accepted }),
  });
}

// ── Analysis ──────────────────────────────────────────────────

export async function fullAnalysis(filePath) {
  return request('/analysis/full', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
    timeout: 180000,
  });
}

export async function fullAnalysisFromFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/analysis/full', {
    method: 'POST',
    body: formData,
    timeout: 180000,
  });
}

// ── Quality ───────────────────────────────────────────────────

export async function getQualityScore(filePath) {
  return request('/quality/score', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  });
}

export async function getQualityEnhancement(filePath) {
  return request('/quality/enhance', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  });
}

// ── Features ──────────────────────────────────────────────────

export async function extractFeatures(filePath) {
  return request('/features/extract', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  });
}

export async function extractFeaturesFromFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/features/extract', {
    method: 'POST',
    body: formData,
    timeout: 30000,
  });
}

// ── Enhancement Analysis ──────────────────────────────────────

export async function enhancementAnalysis(filePath) {
  return request('/enhance/analyse', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  });
}

// ── Genre Timeline ─────────────────────────────────────────────

export async function getTimeline(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/analysis/timeline', {
    method: 'POST',
    body: formData,
    timeout: 120000,
  });
}

export async function getTimelineByPath(filePath) {
  return request('/analysis/timeline', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
    timeout: 120000,
  });
}

export async function preprocessTrack(file, force = false) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('force', String(force));
  return request('/analysis/preprocess', {
    method: 'POST',
    body: formData,
    timeout: 180000,
  });
}

export async function preprocessTrackByPath(filePath, force = false) {
  return request('/analysis/preprocess', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, force }),
    timeout: 180000,
  });
}

export async function analyzeSegment(file, timeOffset) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('time_offset', String(timeOffset));
  return request('/realtime/segment', {
    method: 'POST',
    body: formData,
    timeout: 30000,
  });
}

export async function analyzeSegmentByPath(filePath, timeOffset) {
  return request('/realtime/segment', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath, time_offset: timeOffset }),
    timeout: 30000,
  });
}

// ── Listening Mode Recommendation ─────────────────────────────

export async function getModeRecommendationFromFile(file, mode, options = null) {
  const fileKey = file
    ? `${file.name || 'file'}|${file.size || 0}|${file.lastModified || 0}`
    : 'no-file';
  const optionsKey = options ? JSON.stringify(options) : '{}';
  const cacheKey = `${fileKey}|${mode || 'normal'}|${optionsKey}`;

  const now = Date.now();
  const cached = modeRecommendCache.get(cacheKey);
  if (cached && now - cached.ts <= MODE_RECOMMEND_TTL_MS) {
    return cached.value;
  }

  const pending = modeRecommendInflight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  if (options && typeof options === 'object') {
    Object.entries(options).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      formData.append(key, String(value));
    });
  }
  const reqPromise = request('/mode/recommend', {
    method: 'POST',
    body: formData,
    timeout: 45000,
  }).then((result) => {
    modeRecommendCache.set(cacheKey, { ts: Date.now(), value: result });
    return result;
  }).finally(() => {
    modeRecommendInflight.delete(cacheKey);
  });

  modeRecommendInflight.set(cacheKey, reqPromise);
  return reqPromise;
}

// ── Session & Preferences ─────────────────────────────────────

export async function logSession(data) {
  return request('/session/log', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getPreferences() {
  return request('/preferences');
}

export async function resetPreferences() {
  return request('/preferences/reset', { method: 'POST' });
}

export { API_BASE, ApiError };
