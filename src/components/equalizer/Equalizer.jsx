import { useState, useCallback, useEffect, useRef } from 'react';
import { useRealtimeGenre } from '../../state/RealtimeGenreContext';
import { usePlayer } from '../../state/PlayerContext';
import { fullAnalysisFromFile, getModeRecommendationFromFile } from '../../services/mlApi';
import Icon from '../common/Icons';

// ── Constants ────────────────────────────────────────────────────

const EQ_BAND_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_BAND_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

const PRESETS = {
  Flat:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
  Vocal:      [-2, -1, 0, 2, 5, 5, 3, 1, 0, -1],
  Rock:       [5, 4, 2, 0, -1, 0, 2, 4, 5, 5],
  Jazz:       [3, 2, 0, 2, -2, -2, 0, 2, 3, 4],
  Electronic: [6, 5, 3, 0, -2, 0, 1, 4, 5, 4],
  Classical:  [0, 0, 0, 0, 0, 0, -2, -2, -2, -4],
  'Hip Hop':  [6, 5, 3, 1, -1, -1, 1, 0, 2, 3],
  Acoustic:   [3, 2, 0, 1, 2, 2, 3, 2, 2, 1],
};

const LISTENING_MODES = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Enhanced', label: 'Enhanced' },
  { value: 'Lo-Fi', label: 'Lo-Fi' },
  { value: 'DJ', label: 'DJ (Untrained)' },
];

const TABS = ['EQ', 'Bass', 'Stereo', 'Reverb', 'Norm', 'Convert', 'Analysis'];
const ENHANCED_AUTO_EQ_BASE = [2, 1.5, 1, 0.5, 0, 0.5, 1, 1.5, 1, 0.5];

function clampDb(v, min = -8, max = 8) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

function clampValue(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function deriveAutoProfile({ eq, genre, confidence, intensity }) {
  const safeEq = Array.isArray(eq) && eq.length === 10 ? eq : PRESETS.Flat;
  const conf = clampValue(Number(confidence ?? 0), 0, 1);
  const ai = clampValue(Number(intensity ?? 1), 0, 1.5);

  const low = (safeEq[0] + safeEq[1] + safeEq[2] + safeEq[3]) / 4;
  const mid = (safeEq[4] + safeEq[5] + safeEq[6]) / 3;
  const high = (safeEq[7] + safeEq[8] + safeEq[9]) / 3;

  const genreBias = {
    hiphop: { bass: 2.2, width: -4, reverb: -2, norm: -12 },
    reggae: { bass: 1.6, width: -2, reverb: 0, norm: -13 },
    disco: { bass: 1.1, width: 5, reverb: 2, norm: -13 },
    electronic: { bass: 1.4, width: 7, reverb: 3, norm: -12 },
    pop: { bass: 0.8, width: 4, reverb: 2, norm: -13 },
    rock: { bass: 0.6, width: 3, reverb: 1, norm: -12 },
    jazz: { bass: 0.2, width: 8, reverb: 5, norm: -15 },
    classical: { bass: -0.2, width: 10, reverb: 7, norm: -18 },
    blues: { bass: 0.3, width: 5, reverb: 4, norm: -15 },
    country: { bass: 0.2, width: 3, reverb: 2, norm: -14 },
    metal: { bass: 1.3, width: 1, reverb: -1, norm: -11 },
    unknown: { bass: 0, width: 0, reverb: 0, norm: -14 },
  }[String(genre || 'unknown').toLowerCase()] || { bass: 0, width: 0, reverb: 0, norm: -14 };

  const bassBoost = clampValue((low * 0.9 + genreBias.bass) * ai, -12, 12);
  const bassFreq = clampValue(Math.round(110 - low * 5 - conf * 6), 60, 180);

  const stereoWidth = clampValue(Math.round(100 + (high - low) * 5 + genreBias.width + conf * 4), 65, 160);
  const stereoBalance = clampValue(Math.round((safeEq[6] - safeEq[4]) * 3 * (1 - conf * 0.5)), -22, 22);

  const reverbAmount = clampValue(Math.round(10 + Math.abs(mid) * 3.5 + Math.max(0, high) * 2 + genreBias.reverb), 6, 45);
  const reverbDecay = clampValue(parseFloat((1.8 + Math.abs(mid) * 0.12 + conf * 0.35).toFixed(1)), 1.1, 5.2);

  const normTarget = clampValue(Math.round(genreBias.norm + Math.max(0, low) * 0.35 - conf * 1.1), -20, -10);

  return {
    bassBoost: parseFloat(bassBoost.toFixed(1)),
    bassFreq,
    stereoWidth,
    stereoBalance,
    reverbAmount,
    reverbDecay,
    normEnabled: true,
    normTarget,
  };
}

// ── Main Component ───────────────────────────────────────────────

export default function Equalizer({
  listeningMode: controlledListeningMode,
  onListeningModeChange,
}) {
  const {
    currentTrack,
    isPlaying,
    applyListeningMode,
    applyUserEQGains,
    setSubBassFilterEnabled,
    setBassSettings,
    setStereoSettings,
    setReverbSettings,
    setNormalizationSettings,
  } = usePlayer();
  const {
    currentGenre, currentConfidence,
    autoEQEnabled, setAutoEQEnabled,
    isLoadingTimeline, genreTimeline, currentSegmentEQ,
    preprocessCurrentTrack,
    registerEQCallback, GENRE_EQ_FALLBACK,
  } = useRealtimeGenre();

  // EQ state
  const [eqValues, setEqValues] = useState([...PRESETS.Flat]);
  const [activePreset, setActivePreset] = useState('Flat');
  const [fxActive, setFxActive] = useState(true);
  const [subBassFilter, setSubBassFilter] = useState(false);
  const eqValuesRef = useRef([...PRESETS.Flat]);

  // Listening mode
  const [listeningMode, setListeningMode] = useState('Normal');
  const effectiveListeningMode = controlledListeningMode ?? listeningMode;

  // Deep Intelligence
  const [deepIntelligence, setDeepIntelligence] = useState(true);
  const [aiIntensity, setAiIntensity] = useState(100);

  // Active tab
  const [activeTab, setActiveTab] = useState('EQ');

  // Bass tab
  const [bassBoost, setBassBoost] = useState(0);
  const [bassFreq, setBassFreq] = useState(100);

  // Stereo tab
  const [stereoWidth, setStereoWidth] = useState(100);
  const [stereoBalance, setStereoBalance] = useState(0);

  // Reverb tab
  const [reverbAmount, setReverbAmount] = useState(0);
  const [reverbDecay, setReverbDecay] = useState(2.5);

  // Norm tab
  const [normEnabled, setNormEnabled] = useState(false);
  const [normTarget, setNormTarget] = useState(-14);

  // Analysis result
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Genre change indicator
  const [genreFlash, setGenreFlash] = useState(false);
  const prevGenreRef = useRef(null);
  const lastFallbackTsRef = useRef(0);

  // Smooth EQ transition
  const eqAnimRef = useRef(null);

  const animateEQTransition = useCallback((from, to, durationMs, label = null) => {
    if (eqAnimRef.current) cancelAnimationFrame(eqAnimRef.current);
    const start = performance.now();
    const fromSnapshot = [...from];

    const step = (now) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const current = fromSnapshot.map((f, i) => f + (to[i] - f) * eased);
      eqValuesRef.current = current;
      setEqValues(current);
      applyUserEQGains(current);
      if (t < 1) eqAnimRef.current = requestAnimationFrame(step);
      else if (label) setActivePreset(label);
    };

    eqAnimRef.current = requestAnimationFrame(step);
  }, [applyUserEQGains]);

  // Register EQ change callback with RealtimeGenreContext
  useEffect(() => {
    registerEQCallback((gains, genre, duration) => {
      if (!autoEQEnabled) return;
      const intensity = aiIntensity / 100;
      const blended = gains.map(g => clampDb(g * intensity));
      animateEQTransition(eqValuesRef.current, blended, duration * 1000, 'Smart EQ');
    });
  }, [registerEQCallback, autoEQEnabled, aiIntensity, animateEQTransition]);

  // In Enhanced mode, fallback Auto EQ should still run even if timeline callbacks are sparse.
  useEffect(() => {
    if (!currentTrack || !isPlaying || !autoEQEnabled || effectiveListeningMode !== 'Enhanced') return;

    const tick = () => {
      const now = Date.now();
      if (now - lastFallbackTsRef.current < 900) return;
      lastFallbackTsRef.current = now;

      const base = currentSegmentEQ && currentSegmentEQ.length
        ? currentSegmentEQ
        : (GENRE_EQ_FALLBACK[currentGenre] || ENHANCED_AUTO_EQ_BASE);

      const intensity = aiIntensity / 100;
      const blended = base.map(g => clampDb(g * intensity));

      const changed = blended.some((v, i) => Math.abs(v - (eqValuesRef.current[i] ?? 0)) > 0.12);
      if (changed) {
        animateEQTransition(eqValuesRef.current, blended, 550, 'Smart EQ');
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [
    currentTrack,
    isPlaying,
    effectiveListeningMode,
    autoEQEnabled,
    currentSegmentEQ,
    currentGenre,
    aiIntensity,
    GENRE_EQ_FALLBACK,
    animateEQTransition,
  ]);

  // Make Auto EQ toggle immediately apply current segment/fallback gains when enabled.
  useEffect(() => {
    if (!autoEQEnabled) return;

    const base = currentSegmentEQ && currentSegmentEQ.length
      ? currentSegmentEQ
      : (GENRE_EQ_FALLBACK[currentGenre] || GENRE_EQ_FALLBACK.unknown);

    const intensity = aiIntensity / 100;
    const blended = base.map(g => clampDb(g * intensity));
    animateEQTransition(eqValuesRef.current, blended, 450, 'Smart EQ');
  }, [
    autoEQEnabled,
    currentSegmentEQ,
    currentGenre,
    aiIntensity,
    animateEQTransition,
    GENRE_EQ_FALLBACK,
  ]);

  // Keep Auto EQ profile controls (bass/stereo/reverb/norm) continuously optimized while playing.
  useEffect(() => {
    if (!autoEQEnabled || !isPlaying) return;

    const tick = () => {
      const base = currentSegmentEQ && currentSegmentEQ.length
        ? currentSegmentEQ
        : (GENRE_EQ_FALLBACK[currentGenre] || GENRE_EQ_FALLBACK.unknown);

      const profile = deriveAutoProfile({
        eq: base,
        genre: currentGenre,
        confidence: currentConfidence,
        intensity: aiIntensity / 100,
      });

      setBassBoost(profile.bassBoost);
      setBassFreq(profile.bassFreq);
      setStereoWidth(profile.stereoWidth);
      setStereoBalance(profile.stereoBalance);
      setReverbAmount(profile.reverbAmount);
      setReverbDecay(profile.reverbDecay);
      setNormEnabled(profile.normEnabled);
      setNormTarget(profile.normTarget);
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [
    autoEQEnabled,
    isPlaying,
    currentSegmentEQ,
    currentGenre,
    currentConfidence,
    aiIntensity,
    GENRE_EQ_FALLBACK,
  ]);

  // Flash when genre changes
  useEffect(() => {
    if (currentGenre && currentGenre !== prevGenreRef.current) {
      prevGenreRef.current = currentGenre;
      setGenreFlash(true);
      setTimeout(() => setGenreFlash(false), 1200);
    }
  }, [currentGenre]);

  // If Auto EQ is turned off, freeze controls to best stable choices.
  useEffect(() => {
    if (autoEQEnabled) return;

    const eq = eqValuesRef.current || PRESETS.Flat;
    const low = (eq[0] + eq[1] + eq[2] + eq[3]) / 4;
    const mid = (eq[4] + eq[5] + eq[6]) / 3;
    const high = (eq[7] + eq[8] + eq[9]) / 3;

    setBassBoost(parseFloat(clampValue(low, -12, 12).toFixed(1)));
    setBassFreq(low >= 2 ? 90 : low <= -1 ? 130 : 105);

    const width = clampValue(100 + ((high - low) * 6), 70, 140);
    setStereoWidth(Math.round(width));
    setStereoBalance(0);

    const rvbAmount = clampValue(10 + Math.abs(mid) * 4 + Math.max(0, high) * 2, 8, 38);
    const rvbDecay = clampValue(2.1 + Math.abs(mid) * 0.15, 1.2, 4.8);
    setReverbAmount(Math.round(rvbAmount));
    setReverbDecay(parseFloat(rvbDecay.toFixed(1)));

    setNormEnabled(true);
    setNormTarget(-14);
  }, [autoEQEnabled]);

  const handleSlider = useCallback((idx, val) => {
    if (autoEQEnabled) setAutoEQEnabled(false);
    setEqValues(prev => {
      const next = [...prev];
      next[idx] = parseFloat(val);
      eqValuesRef.current = next;
      applyUserEQGains(next);
      return next;
    });
    setActivePreset('Custom');
  }, [applyUserEQGains, autoEQEnabled, setAutoEQEnabled]);

  useEffect(() => {
    applyUserEQGains(eqValuesRef.current);
  }, [applyUserEQGains]);

  useEffect(() => {
    setSubBassFilterEnabled(subBassFilter);
  }, [subBassFilter, setSubBassFilterEnabled]);

  useEffect(() => {
    setBassSettings?.({ boost: bassBoost, freq: bassFreq });
  }, [bassBoost, bassFreq, setBassSettings]);

  useEffect(() => {
    setStereoSettings?.({ width: stereoWidth, balance: stereoBalance });
  }, [stereoWidth, stereoBalance, setStereoSettings]);

  useEffect(() => {
    setReverbSettings?.({ amount: reverbAmount, decay: reverbDecay });
  }, [reverbAmount, reverbDecay, setReverbSettings]);

  useEffect(() => {
    setNormalizationSettings?.({ enabled: normEnabled, target: normTarget });
  }, [normEnabled, normTarget, setNormalizationSettings]);

  const applyPreset = useCallback((name) => {
    if (autoEQEnabled) setAutoEQEnabled(false);
    const vals = PRESETS[name];
    if (vals) {
      animateEQTransition(eqValuesRef.current, vals, 400, name);
      setActivePreset(name);
    }
  }, [animateEQTransition, autoEQEnabled, setAutoEQEnabled]);

  const resetEQ = useCallback(() => {
    if (autoEQEnabled) setAutoEQEnabled(false);
    animateEQTransition(eqValuesRef.current, PRESETS.Flat, 300, 'Flat');
    setActivePreset('Flat');
  }, [animateEQTransition, autoEQEnabled, setAutoEQEnabled]);

  const applySmartEQ = useCallback(() => {
    const genre = currentGenre || 'unknown';
    const fallback = GENRE_EQ_FALLBACK[genre] ?? GENRE_EQ_FALLBACK.unknown;
    setAutoEQEnabled(true);
    animateEQTransition(eqValuesRef.current, fallback, 600, `Smart EQ (${genre})`);
    setActivePreset(`Smart EQ (${genre})`);
  }, [currentGenre, animateEQTransition, GENRE_EQ_FALLBACK, setAutoEQEnabled]);

  const runAnalysis = useCallback(async () => {
    if (!currentTrack?.file) return;
    setIsAnalyzing(true);
    try {
      const result = await fullAnalysisFromFile(currentTrack.file);
      setAnalysisResult(result);
    } catch (e) {
      setAnalysisResult({ error: e.message });
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentTrack]);

  const getListeningModeClass = (mode) => {
    if (mode === 'Lo-Fi') return 'mode-lofi';
    if (mode === 'DJ') return 'mode-dj';
    return '';
  };

  const handleListeningMode = useCallback(async (mode) => {
    if (onListeningModeChange) {
      onListeningModeChange(mode);
      return;
    }

    setListeningMode(mode);
    applyListeningMode(mode);

    if (!currentTrack?.file || mode === 'Normal') return;

    if (mode === 'Enhanced') {
      preprocessCurrentTrack(currentTrack).catch(() => {});
    }

    try {
      const result = await getModeRecommendationFromFile(currentTrack.file, mode);
      if (result?.status === 'ok') {
        applyListeningMode(mode, result);
      }
    } catch {
      // Keep fallback mode response if backend request fails.
    }
  }, [onListeningModeChange, applyListeningMode, currentTrack, preprocessCurrentTrack]);

  return (
    <div className="eq-panel fade-in">

      {/* ── Audio Quality Header ─────────────────────────────── */}
      <div className="eq-section-header">
        <span className="eq-section-title">AUDIO QUALITY</span>
        <div className="eq-header-toggles">
          <label className="eq-toggle-inline">
            <input
              type="checkbox"
              checked={subBassFilter}
              onChange={e => {
                const enabled = e.target.checked;
                setSubBassFilter(enabled);
                setSubBassFilterEnabled(enabled);
              }}
            />
            <span className="eq-toggle-track" />
            <span className="eq-toggle-label">Sub-bass filter (30 Hz)</span>
          </label>
          <label className="eq-toggle-inline">
            <input type="checkbox" checked={fxActive} onChange={e => setFxActive(e.target.checked)} />
            <span className="eq-toggle-track" />
            <span className="eq-toggle-label">FX Active</span>
          </label>
        </div>
      </div>

      {/* ── Listening Mode ───────────────────────────────────── */}
      <div className="eq-listening-row">
        <span className="eq-row-label">LISTENING MODE</span>
        <div className="eq-mode-group">
          {LISTENING_MODES.map(mode => (
            <button
              key={mode.value}
              className={`eq-mode-btn ${effectiveListeningMode === mode.value ? 'active' : ''} ${getListeningModeClass(mode.value)}`}
              onClick={() => handleListeningMode(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Deep Intelligence ────────────────────────────────── */}
      <div className="eq-deep-intel-row">
        <label className="eq-toggle-inline eq-deep-toggle">
          <input
            type="checkbox"
            checked={deepIntelligence}
            onChange={e => setDeepIntelligence(e.target.checked)}
          />
          <span className="eq-toggle-track" />
          <div className="eq-deep-text">
            <span className="eq-deep-title">Deep Intelligence</span>
            <span className="eq-deep-desc">
              25+ metrics · per-song learning · optional questions for taste matching · controls every parameter
            </span>
          </div>
        </label>
        <div className="eq-intensity-row">
          <span className="eq-row-label">Intensity</span>
          <input
            type="range" min="0" max="100" step="1"
            value={aiIntensity}
            onChange={e => setAiIntensity(parseInt(e.target.value))}
            className="eq-intensity-slider"
            disabled={!deepIntelligence}
          />
          <span className="eq-intensity-val">{aiIntensity}%</span>
        </div>
      </div>

      {/* ── Auto Genre Badge ─────────────────────────────────── */}
      {currentGenre && (
        <div className={`eq-genre-badge ${genreFlash ? 'flash' : ''}`}>
          <span className="eq-genre-label">
            {isLoadingTimeline ? 'Analyzing...' : `Now: ${currentGenre.toUpperCase()}`}
          </span>
          {currentConfidence > 0 && (
            <span className="eq-genre-conf">{Math.round(currentConfidence * 100)}% confident</span>
          )}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="eq-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`eq-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────── */}
      <div className="eq-tab-content" style={{ opacity: fxActive ? 1 : 0.4, transition: 'opacity 0.3s' }}>

        {activeTab === 'EQ' && (
          <div className="eq-tab-eq">
            <div className="eq-preset-row">
              <select
                className="eq-preset-select"
                value={activePreset}
                onChange={e => applyPreset(e.target.value)}
              >
                {Object.keys(PRESETS).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
                {!PRESETS[activePreset] && (
                  <option value={activePreset}>{activePreset}</option>
                )}
              </select>
              <button className="eq-reset-btn" onClick={resetEQ}>Reset</button>
            </div>

            <div className="eq-sliders">
              {EQ_BAND_FREQS.map((freq, i) => (
                <div key={freq} className="eq-band-col">
                  <span className="eq-band-db">
                    {eqValues[i] > 0 ? '+' : ''}{eqValues[i].toFixed(1)} dB
                  </span>
                  <div className="eq-slider-track">
                    <input
                      type="range"
                      min="-12" max="12" step="0.5"
                      value={eqValues[i]}
                      onChange={e => handleSlider(i, e.target.value)}
                      className="eq-band-slider"
                      disabled={!fxActive}
                    />
                  </div>
                  <span className="eq-band-freq">{EQ_BAND_LABELS[i]}</span>
                </div>
              ))}
            </div>

            <div className="eq-actions-row">
              <button className="eq-smart-btn" onClick={applySmartEQ}>
                <span className="inline-flex items-center gap-2"><Icon name="brain" className="h-4 w-4" /> Smart EQ {currentGenre ? `(${currentGenre})` : '(AI)'}</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'Bass' && (
          <div className="eq-tab-section">
            <div className="eq-param-row">
              <label className="eq-param-label">Bass Boost</label>
              <input type="range" min="-12" max="12" step="0.5"
                value={bassBoost} onChange={e => setBassBoost(parseFloat(e.target.value))}
                className="eq-param-slider" />
              <span className="eq-param-val">{bassBoost > 0 ? '+' : ''}{bassBoost} dB</span>
            </div>
            <div className="eq-param-row">
              <label className="eq-param-label">Frequency</label>
              <input type="range" min="40" max="250" step="5"
                value={bassFreq} onChange={e => setBassFreq(parseInt(e.target.value))}
                className="eq-param-slider" />
              <span className="eq-param-val">{bassFreq} Hz</span>
            </div>
            <div className="eq-info-box">
              Adjusts low-frequency (bass) gain. Higher frequency affects more bass range.
            </div>
          </div>
        )}

        {activeTab === 'Stereo' && (
          <div className="eq-tab-section">
            <div className="eq-param-row">
              <label className="eq-param-label">Stereo Width</label>
              <input type="range" min="0" max="200" step="1"
                value={stereoWidth} onChange={e => setStereoWidth(parseInt(e.target.value))}
                className="eq-param-slider" />
              <span className="eq-param-val">{stereoWidth}%</span>
            </div>
            <div className="eq-param-row">
              <label className="eq-param-label">Balance</label>
              <input type="range" min="-100" max="100" step="1"
                value={stereoBalance} onChange={e => setStereoBalance(parseInt(e.target.value))}
                className="eq-param-slider" />
              <span className="eq-param-val">{stereoBalance > 0 ? 'R' : stereoBalance < 0 ? 'L' : 'C'} {Math.abs(stereoBalance)}%</span>
            </div>
          </div>
        )}

        {activeTab === 'Reverb' && (
          <div className="eq-tab-section">
            <div className="eq-param-row">
              <label className="eq-param-label">Reverb Amount</label>
              <input type="range" min="0" max="100" step="1"
                value={reverbAmount} onChange={e => setReverbAmount(parseInt(e.target.value))}
                className="eq-param-slider" />
              <span className="eq-param-val">{reverbAmount}%</span>
            </div>
            <div className="eq-param-row">
              <label className="eq-param-label">Decay Time</label>
              <input type="range" min="0.1" max="10" step="0.1"
                value={reverbDecay} onChange={e => setReverbDecay(parseFloat(e.target.value))}
                className="eq-param-slider" />
              <span className="eq-param-val">{reverbDecay}s</span>
            </div>
            <div className="eq-info-box">
              Simulates acoustic space. Higher decay = larger room effect.
            </div>
          </div>
        )}

        {activeTab === 'Norm' && (
          <div className="eq-tab-section">
            <div className="eq-param-row">
              <label className="eq-param-label">Normalize</label>
              <label className="eq-toggle-inline">
                <input type="checkbox" checked={normEnabled} onChange={e => setNormEnabled(e.target.checked)} />
                <span className="eq-toggle-track" />
              </label>
            </div>
            <div className="eq-param-row">
              <label className="eq-param-label">Target Level</label>
              <input type="range" min="-24" max="-6" step="1"
                value={normTarget} onChange={e => setNormTarget(parseInt(e.target.value))}
                disabled={!normEnabled}
                className="eq-param-slider" />
              <span className="eq-param-val">{normTarget} LUFS</span>
            </div>
            <div className="eq-info-box">
              Normalization adjusts playback loudness to a consistent target level.
            </div>
          </div>
        )}

        {activeTab === 'Convert' && (
          <div className="eq-tab-section eq-tab-center">
            <div className="eq-convert-icon inline-flex items-center justify-center"><Icon name="download" className="h-10 w-10" /></div>
            <div className="eq-yt-title">Audio Converter</div>
            <div className="eq-info-box">
              Export the current track with applied EQ and effects.
            </div>
            <div className="eq-param-row" style={{ justifyContent: 'center', gap: '12px' }}>
              {['WAV', 'MP3', 'FLAC', 'AAC'].map(fmt => (
                <button key={fmt} className="eq-format-btn">{fmt}</button>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
              Conversion requires ffmpeg to be installed on the server.
            </div>
          </div>
        )}

        {activeTab === 'Analysis' && (
          <div className="eq-tab-section">
            {!currentTrack ? (
              <div className="eq-info-box">Load a track to run audio analysis.</div>
            ) : (
              <>
                <button
                  className="eq-smart-btn"
                  onClick={runAnalysis}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? 'Analyzing...' : <span className="inline-flex items-center gap-2"><Icon name="analysis" className="h-4 w-4" /> Run Full Analysis</span>}
                </button>

                {analysisResult && (
                  <div className="eq-analysis-results">
                    {analysisResult.error ? (
                      <div className="eq-info-box" style={{ color: 'var(--accent-danger)' }}>
                        {analysisResult.error}
                      </div>
                    ) : (
                      <>
                        {analysisResult.genre && (
                          <div className="eq-result-row">
                            <span className="eq-result-label">Genre</span>
                            <span className="eq-result-val genre-tag">
                              {analysisResult.genre.top_genre}
                              <span style={{ opacity: 0.6 }}>
                                {' '}({Math.round((analysisResult.genre.confidence ?? 0) * 100)}%)
                              </span>
                            </span>
                          </div>
                        )}
                        {analysisResult.quality && (
                          <div className="eq-result-row">
                            <span className="eq-result-label">Quality</span>
                            <span className="eq-result-val">
                              {analysisResult.quality.score ?? analysisResult.quality.quality_score ?? '—'}/100
                              {analysisResult.quality.rating && (
                                <span style={{ marginLeft: 6, opacity: 0.7 }}>
                                  {analysisResult.quality.rating}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {genreTimeline.length > 0 && (
                          <div className="eq-timeline-preview">
                            <div className="eq-result-label" style={{ marginBottom: 6 }}>
                              Genre Timeline ({genreTimeline.length} segments)
                            </div>
                            <div className="eq-timeline-strip">
                              {genreTimeline.map((seg, i) => (
                                <div
                                  key={i}
                                  className="eq-timeline-seg"
                                  title={`${seg.time_start}s: ${seg.genre} (${Math.round(seg.confidence * 100)}%)`}
                                  style={{ flex: seg.time_end - seg.time_start }}
                                  data-genre={seg.genre}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
