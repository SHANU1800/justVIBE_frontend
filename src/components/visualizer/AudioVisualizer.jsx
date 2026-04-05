import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayer } from '../../state/PlayerContext';

const FFT_SIZE = 1024;
const RMS_ALPHA = 0.14;
const CENTROID_ALPHA = 0.08;
const PULSE_ALPHA = 0.14;
const BANDS = 24;
const WAVE_SECONDS = 2;
const BG_UPDATE_MS = 2000;
const ONSET_THRESHOLD = 0.09;

const MOOD_TINT = {
  __gray__: [148, 163, 184],
  __theme__: [56, 189, 248],
  chill: [125, 211, 252],
  focus: [110, 231, 183],
  hype: [251, 191, 36],
  romantic: [244, 114, 182],
  melancholy: [147, 197, 253],
  dreamy: [196, 181, 253],
};

export default function AudioVisualizer({
  height = 120,
  showControls = true,
  userMood = 'chill',
  waveformOnly = false,
  analyserType = 'processed',
  monochrome = false,
  graphMode = 'hybrid',
  compareOverlay = false,
  compareAnalyserType = 'original',
  cleanFrequencyOnly = false,
  minimal = false,
  tintKey = null,
  showFrequencyGuides = true,
}) {
  const { audioRef, isPlaying, getSharedAnalyserNode, getAnalyserNode } = usePlayer();

  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const animRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const compareAnalyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamSourceRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const freqRef = useRef(null);
  const compareFreqRef = useRef(null);
  const timeRef = useRef(null);
  const compareTimeRef = useRef(null);

  const barsRef = useRef(new Float32Array(BANDS).fill(0));
  const waveHistoryRef = useRef(Array.from({ length: 360 }, () => 0));
  const compareWaveHistoryRef = useRef(Array.from({ length: 360 }, () => 0));

  const smoothRef = useRef({
    rms: 0,
    pulse: 0,
    centroid: 0.25,
    shimmer: 0,
  });

  const onsetStateRef = useRef({
    prevRms: 0,
    glow: 0,
  });

  const backgroundRef = useRef({
    targetWarmth: 0.65,
    targetBrightness: 0.2,
    warmth: 0.65,
    brightness: 0.2,
    lastUpdateTs: 0,
  });
  const uiUpdateRef = useRef(0);

  const [moodText, setMoodText] = useState('Idle');
  const [intensity, setIntensity] = useState(0);
  const renderMood = monochrome ? '__gray__' : (tintKey || userMood);

  const moodBadgeClass = {
    chill: 'from-cyan-400/25 to-sky-500/20 text-cyan-100 border-cyan-300/40',
    focus: 'from-emerald-400/25 to-teal-500/20 text-emerald-100 border-emerald-300/40',
    hype: 'from-amber-300/30 to-orange-500/25 text-amber-50 border-amber-300/45',
    romantic: 'from-pink-400/25 to-fuchsia-500/25 text-pink-100 border-pink-300/40',
    melancholy: 'from-blue-300/20 to-indigo-500/25 text-blue-100 border-blue-300/35',
    dreamy: 'from-violet-300/25 to-indigo-400/20 text-violet-100 border-violet-300/40',
  }[userMood] || 'from-violet-400/25 to-cyan-400/20 text-violet-100 border-violet-300/40';

  const setupAudio = useCallback(() => {
    const audio = audioRef?.current;
    if (!audio) return;

    const sharedAnalyser = getAnalyserNode?.(analyserType) || getSharedAnalyserNode?.();
    if (sharedAnalyser) {
      analyserRef.current = sharedAnalyser;
      compareAnalyserRef.current = compareOverlay ? (getAnalyserNode?.(compareAnalyserType) || null) : null;
      if (!freqRef.current || freqRef.current.length !== sharedAnalyser.frequencyBinCount) {
        freqRef.current = new Uint8Array(sharedAnalyser.frequencyBinCount);
        timeRef.current = new Uint8Array(sharedAnalyser.frequencyBinCount);
      }
      if (compareAnalyserRef.current && (!compareFreqRef.current || compareFreqRef.current.length !== compareAnalyserRef.current.frequencyBinCount)) {
        compareFreqRef.current = new Uint8Array(compareAnalyserRef.current.frequencyBinCount);
        compareTimeRef.current = new Uint8Array(compareAnalyserRef.current.frequencyBinCount);
      }
      return;
    }

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    const ctx = audioCtxRef.current;

    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = FFT_SIZE;
      analyserRef.current.smoothingTimeConstant = 0.72;
      freqRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      timeRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
    }

    if (!sourceRef.current && !streamSourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audio);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      } catch {
        // If media element source is already connected elsewhere, fallback to captureStream.
        try {
          const stream =
            typeof audio.captureStream === 'function'
              ? audio.captureStream()
              : (typeof audio.mozCaptureStream === 'function' ? audio.mozCaptureStream() : null);

          if (stream) {
            mediaStreamRef.current = stream;
            streamSourceRef.current = ctx.createMediaStreamSource(stream);
            streamSourceRef.current.connect(analyserRef.current);
          }
        } catch {
          // keep graceful fallback; visualizer will continue with low-activity mode
        }
      }
    }
  }, [audioRef, getSharedAnalyserNode, getAnalyserNode, analyserType, compareOverlay, compareAnalyserType]);

  const resumeAudio = useCallback(() => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  useEffect(() => {
    setupAudio();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [setupAudio]);

  useEffect(() => {
    if (isPlaying) resumeAudio();
  }, [isPlaying, resumeAudio]);

  const updateWaveHistory = useCallback((chunk) => {
    const history = waveHistoryRef.current;
    const targetLength = Math.max(220, Math.floor((WAVE_SECONDS * 60) * 3));

    if (history.length !== targetLength) {
      waveHistoryRef.current = Array.from({ length: targetLength }, (_, i) => {
        const src = history[Math.max(0, history.length - targetLength + i)] ?? 0;
        return src;
      });
    }

    const h = waveHistoryRef.current;
    for (let i = 0; i < chunk.length; i++) {
      h.push(chunk[i]);
      if (h.length > targetLength) h.shift();
    }
  }, []);

  const updateCompareWaveHistory = useCallback((chunk) => {
    const history = compareWaveHistoryRef.current;
    const targetLength = Math.max(220, Math.floor((WAVE_SECONDS * 60) * 3));

    if (history.length !== targetLength) {
      compareWaveHistoryRef.current = Array.from({ length: targetLength }, (_, i) => {
        const src = history[Math.max(0, history.length - targetLength + i)] ?? 0;
        return src;
      });
    }

    const h = compareWaveHistoryRef.current;
    for (let i = 0; i < chunk.length; i++) {
      h.push(chunk[i]);
      if (h.length > targetLength) h.shift();
    }
  }, []);

  const updateBars = useCallback((targetBands) => {
    const bars = barsRef.current;
    for (let i = 0; i < bars.length; i++) {
      const target = clamp01(targetBands[i]);
      const current = bars[i];
      const alpha = target > current ? 0.6 : 0.1; // fast attack, slow decay
      bars[i] = current + (target - current) * alpha;
    }
  }, []);

  const detectOnset = useCallback((rms) => {
    const onset = onsetStateRef.current;
    const delta = rms - onset.prevRms;
    if (delta > ONSET_THRESHOLD) {
      onset.glow = Math.min(1, onset.glow + 0.5);
    }
    onset.prevRms = rms;
  }, []);

  const readSignals = useCallback(() => {
    const analyser = analyserRef.current;
    const freqData = freqRef.current;
    const timeData = timeRef.current;

    if (!analyser || !freqData || !timeData) {
      return {
        rms: 0,
        centroidNorm: 0.2,
        bands: new Float32Array(BANDS).fill(0),
        spectrum: new Float32Array(160).fill(0),
        compareBands: null,
        compareSpectrum: null,
        waveChunk: [0, 0, 0],
        compareWaveChunk: null,
        shimmer: 0,
      };
    }

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    const rms = computeRms(timeData);
    const centroidNorm = computeCentroidNorm(freqData, analyser.context.sampleRate, FFT_SIZE);
    const bands = computeLogBands(freqData, BANDS, 1.2);
    const spectrum = computeSpectrumCurve(freqData, 160);
    let compareBands = null;
    let compareSpectrum = null;
    let compareWaveChunk = null;
    const compareAnalyser = compareAnalyserRef.current;
    const compareFreq = compareFreqRef.current;
    const compareTime = compareTimeRef.current;
    if (compareOverlay && compareAnalyser && compareFreq && compareTime) {
      compareAnalyser.getByteFrequencyData(compareFreq);
      compareAnalyser.getByteTimeDomainData(compareTime);
      compareBands = computeLogBands(compareFreq, BANDS, 1.2);
      compareSpectrum = computeSpectrumCurve(compareFreq, 160);
      compareWaveChunk = extractWaveChunk(compareTime, 8);
    }
    const waveChunk = extractWaveChunk(timeData, 8);
    const shimmer = computeShimmer(freqData);

    detectOnset(rms);
    updateBars(bands);
    updateWaveHistory(waveChunk);
    if (compareWaveChunk) updateCompareWaveHistory(compareWaveChunk);

    return { rms, centroidNorm, bands, spectrum, compareBands, compareSpectrum, waveChunk, compareWaveChunk, shimmer };
  }, [detectOnset, updateBars, updateWaveHistory, updateCompareWaveHistory, compareOverlay]);

  const updateSmoothSignals = useCallback((signals, ts) => {
    const s = smoothRef.current;
    s.rms = s.rms * (1 - RMS_ALPHA) + signals.rms * RMS_ALPHA;
    s.pulse = s.pulse * (1 - PULSE_ALPHA) + signals.rms * PULSE_ALPHA;
    s.centroid = s.centroid * (1 - CENTROID_ALPHA) + signals.centroidNorm * CENTROID_ALPHA;
    s.shimmer = s.shimmer * 0.86 + signals.shimmer * 0.14;

    onsetStateRef.current.glow *= 0.9;

    if (ts - uiUpdateRef.current > 140) {
      uiUpdateRef.current = ts;
      const mood = classifyMood(s.rms, s.centroid);
      setMoodText(mood);
      setIntensity(Math.round(clamp01(s.rms) * 100));
    }
  }, []);

  const updateBackgroundTargets = useCallback((ts, signals) => {
    const bg = backgroundRef.current;

    if (ts - bg.lastUpdateTs > BG_UPDATE_MS) {
      bg.lastUpdateTs = ts;
      bg.targetWarmth = clamp01(1 - signals.centroidNorm);
      bg.targetBrightness = clamp01(0.12 + signals.rms * 0.55);
    }

    bg.warmth = lerp(bg.warmth, bg.targetWarmth, 0.03);
    bg.brightness = lerp(bg.brightness, bg.targetBrightness, 0.03);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const render = (ts) => {
      animRef.current = requestAnimationFrame(render);

      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      const signals = readSignals();
      updateSmoothSignals(signals, ts);
      updateBackgroundTargets(ts, signals);

      const smoothed = smoothRef.current;
      const bg = backgroundRef.current;
      const beatGlow = onsetStateRef.current.glow;

      if (!waveformOnly && !cleanFrequencyOnly && !minimal) {
        drawBackgroundLayer(ctx, w, h, bg, smoothed, userMood, ts);
        drawPulseLayer(ctx, w, h, smoothed.pulse, beatGlow, userMood);
      }

      const mode = cleanFrequencyOnly ? 'frequency' : (waveformOnly ? 'waveform' : graphMode);
      const showBars = mode === 'hybrid' || mode === 'bars';
      const showFrequency = mode === 'frequency';
      const showWave = mode === 'hybrid' || mode === 'waveform';

      if (!waveformOnly && showBars) {
        if (signals.compareBands) {
          drawSpectrumLayer(ctx, w, h, signals.compareBands, '__gray__', 0.45);
        }
        drawSpectrumLayer(ctx, w, h, barsRef.current, renderMood);
      }

      if (!waveformOnly && showFrequency) {
        if (signals.compareSpectrum) {
          drawFrequencySpectrumLayer(ctx, w, h, signals.compareSpectrum, '__gray__', 0.8, 1.6, showFrequencyGuides);
        }
        drawFrequencySpectrumLayer(ctx, w, h, signals.spectrum, renderMood, 0.95, 2.2, showFrequencyGuides);
      }

      if (showWave || waveformOnly) {
        if (compareOverlay) {
          drawWaveformLayer(ctx, w, h, compareWaveHistoryRef.current, '__gray__', waveformOnly, 0.55, waveformOnly ? 2 : 1.4);
        }
        drawWaveformLayer(ctx, w, h, waveHistoryRef.current, renderMood, waveformOnly);
      }
      if (!waveformOnly && !cleanFrequencyOnly && !minimal) {
        drawShimmer(ctx, w, h, smoothed.shimmer);
      }

      if (wrapperRef.current) {
        wrapperRef.current.style.setProperty('--vibe-intensity', `${Math.max(0.08, smoothed.rms).toFixed(3)}`);
      }
    };

    render(performance.now());

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [userMood, renderMood, waveformOnly, graphMode, cleanFrequencyOnly, minimal, compareOverlay, showFrequencyGuides, readSignals, updateSmoothSignals, updateBackgroundTargets]);

  return (
    <div
      ref={wrapperRef}
      className={`visualizer-wrapper immersive layered transition-all duration-700 ease-out ${isPlaying ? 'playing' : ''}`}
      style={{ position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        width={1400}
        height={height}
        className="transition-[filter,transform] duration-700 ease-out"
        style={{ width: '100%', height: `${height}px`, display: 'block', cursor: 'crosshair' }}
        onClick={resumeAudio}
      />

      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/60 px-3 py-2 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <span className="text-xs tracking-wide text-slate-300/90 transition-colors duration-500">
            Layered mode · smooth waveform · pulse · mood background
          </span>

          <span className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <span
              className={`inline-flex items-center rounded-full border bg-linear-to-r px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-sm transition-all duration-500 ${moodBadgeClass}`}
            >
              {capitalize(userMood)} → {moodText}
            </span>
            <span className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-100 transition-all duration-500">
              RMS {intensity}%
            </span>
            <span className="inline-flex items-center rounded-full border border-violet-300/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-violet-100 transition-all duration-500">
              {graphMode}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function drawBackgroundLayer(ctx, w, h, bg, smooth, mood, ts) {
  const tint = MOOD_TINT[mood] || MOOD_TINT.chill;
  const warm = [250, 143, 99];
  const cool = [109, 132, 255];

  const base = mixColor(warm, cool, 1 - bg.warmth);
  const moodMixed = mixColor(base, tint, 0.24);

  const driftX = Math.sin(ts * 0.00009) * w * 0.06;
  const driftY = Math.cos(ts * 0.00007) * h * 0.08;

  const g = ctx.createRadialGradient(
    w * 0.5 + driftX,
    h * 0.42 + driftY,
    18,
    w * 0.5 + driftX,
    h * 0.42 + driftY,
    Math.max(w, h) * (0.9 + smooth.rms * 0.3),
  );

  g.addColorStop(0, rgba(moodMixed, 0.08 + bg.brightness * 0.42));
  g.addColorStop(0.65, rgba(base, 0.05 + bg.brightness * 0.2));
  g.addColorStop(1, 'rgba(6, 10, 20, 0)');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawPulseLayer(ctx, w, h, pulseValue, beatGlow, mood) {
  const tint = MOOD_TINT[mood] || MOOD_TINT.chill;
  const cx = w * 0.5;
  const cy = h * 0.48;

  const baseRadius = Math.min(w, h) * 0.16;
  const radius = baseRadius + pulseValue * Math.min(w, h) * 0.09;

  const glow = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius * 1.45);
  glow.addColorStop(0, `rgba(255,255,255,${0.18 + pulseValue * 0.2})`);
  glow.addColorStop(0.58, rgba(tint, 0.18 + pulseValue * 0.22 + beatGlow * 0.08));
  glow.addColorStop(1, 'rgba(6,10,20,0)');

  ctx.beginPath();
  ctx.fillStyle = glow;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = rgba(tint, 0.32 + pulseValue * 0.3 + beatGlow * 0.15);
  ctx.arc(cx, cy, radius * (1.03 + pulseValue * 0.03), 0, Math.PI * 2);
  ctx.stroke();
}

function drawSpectrumLayer(ctx, w, h, bars, mood, alphaMult = 1) {
  const tint = MOOD_TINT[mood] || MOOD_TINT.chill;
  const isGray = mood === '__gray__';
  const yFloor = h - 4;
  const topPad = h * 0.1;
  const usableH = yFloor - topPad;

  const gap = 2;
  const barW = (w - gap * (bars.length - 1) - 16) / bars.length;
  let x = 8;

  for (let i = 0; i < bars.length; i++) {
    const bassBoost = 1 + (1 - i / bars.length) * 0.22;
    const v = clamp01(bars[i] * bassBoost);
    const barH = Math.max(3, usableH * (0.04 + v * 0.96));
    const y = yFloor - barH;

    const grad = ctx.createLinearGradient(0, y, 0, yFloor);
    if (isGray) {
      grad.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.55 * alphaMult})`);
      grad.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.08 * alphaMult})`);
    } else {
      grad.addColorStop(0, rgba(tint, 0.92 * alphaMult));
      grad.addColorStop(0.55, rgba(tint, 0.55 * alphaMult));
      grad.addColorStop(1, rgba(tint, 0.12 * alphaMult));
    }

    roundRect(ctx, x, y, barW, barH, Math.min(3, barW * 0.5));
    ctx.fillStyle = grad;
    ctx.fill();

    if (!isGray && v > 0.35) {
      ctx.shadowBlur = 6 + v * 8;
      ctx.shadowColor = rgba(tint, 0.55 * alphaMult);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    x += barW + gap;
  }
}

function drawFrequencySpectrumLayer(ctx, w, h, spectrum, mood, alpha = 0.9, lineWidth = 2, showGuides = true) {
  const tint = MOOD_TINT[mood] || MOOD_TINT.chill;
  const isGray = mood === '__gray__';
  const yFloor = h - 4;
  const top = h * 0.06;

  // Guide lines — very subtle
  if (showGuides) {
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},0.09)`;
    for (let i = 1; i <= 3; i++) {
      const y = yFloor - ((yFloor - top) * i) / 4;
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
    }
    ctx.stroke();
  }

  if (spectrum.length === 0) return;

  // Build the path points
  const pts = [];
  for (let i = 0; i < spectrum.length; i++) {
    const x = (i / Math.max(1, spectrum.length - 1)) * (w - 16) + 8;
    const y = yFloor - clamp01(spectrum[i]) * (yFloor - top);
    pts.push([x, y]);
  }

  // ── Filled area under the curve ──────────────────────────
  const fillGrad = ctx.createLinearGradient(0, top, 0, yFloor);
  if (isGray) {
    fillGrad.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.18 * alpha})`);
    fillGrad.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0.01)`);
  } else {
    fillGrad.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.34 * alpha})`);
    fillGrad.addColorStop(0.6, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.12 * alpha})`);
    fillGrad.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0.01)`);
  }

  ctx.beginPath();
  ctx.moveTo(pts[0][0], yFloor);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], yFloor);
  ctx.closePath();
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // ── Stroke the curve line ─────────────────────────────────
  ctx.beginPath();
  ctx.lineWidth = isGray ? lineWidth * 0.85 : lineWidth;
  ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${alpha})`;

  if (!isGray) {
    ctx.shadowBlur = 10;
    ctx.shadowColor = `rgba(${tint[0]},${tint[1]},${tint[2]},0.55)`;
  }

  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
    else ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── Thin bright highlight on the processed line ───────────
  if (!isGray) {
    ctx.beginPath();
    ctx.lineWidth = lineWidth * 0.38;
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.22})`;
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
      else ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
  }
}

function computeSpectrumCurve(freqData, points = 160) {
  const len = Math.max(8, points);
  const out = new Float32Array(len);
  const minBin = 1;
  const maxBin = Math.max(minBin + 1, freqData.length - 1);

  for (let p = 0; p < len; p++) {
    const t0 = p / len;
    const t1 = (p + 1) / len;
    const i0 = Math.floor(minBin * Math.pow(maxBin / minBin, t0));
    const i1 = Math.floor(minBin * Math.pow(maxBin / minBin, t1));

    let sum = 0;
    let n = 0;
    for (let i = i0; i <= Math.max(i0, i1); i++) {
      sum += freqData[i] / 255;
      n += 1;
    }

    const avg = n > 0 ? sum / n : 0;
    out[p] = clamp01(Math.log1p(avg * 9) / Math.log1p(9));
  }

  return out;
}

function drawWaveformLayer(ctx, w, h, history, mood, waveformOnly = false, alpha = 0.84, lineWidthOverride = null) {
  const tint = MOOD_TINT[mood] || MOOD_TINT.chill;
  const isGray = mood === '__gray__';
  const yMid = waveformOnly ? h * 0.52 : h * 0.78;
  const amp = waveformOnly ? h * 0.24 : h * 0.14;

  const smoothed = movingAverage(history, 5);
  if (smoothed.length === 0) return;

  // ── Subtle baseline ──────────────────────────────────────
  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = isGray ? 'rgba(148,163,184,0.14)' : `rgba(${tint[0]},${tint[1]},${tint[2]},0.18)`;
  ctx.moveTo(0, yMid);
  ctx.lineTo(w, yMid);
  ctx.stroke();

  // Build path points
  const pts = smoothed.map((v, i) => [
    (i / Math.max(1, smoothed.length - 1)) * w,
    yMid - v * amp,
  ]);

  // ── Filled band between waveform and midline ─────────────
  if (!isGray) {
    const fillGrad = ctx.createLinearGradient(0, yMid - amp, 0, yMid + amp);
    fillGrad.addColorStop(0,   `rgba(${tint[0]},${tint[1]},${tint[2]},${0.22 * alpha})`);
    fillGrad.addColorStop(0.5, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.06 * alpha})`);
    fillGrad.addColorStop(1,   `rgba(${tint[0]},${tint[1]},${tint[2]},${0.22 * alpha})`);

    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
      else ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.lineTo(pts[pts.length - 1][0], yMid);
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(pts[i][0], yMid);
    }
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  // ── Stroke the waveform ──────────────────────────────────
  const lw = lineWidthOverride ?? (waveformOnly ? 2.2 : (isGray ? 1.1 : 1.7));
  ctx.beginPath();
  ctx.lineWidth = lw;
  ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${alpha})`;

  if (!isGray) {
    ctx.shadowBlur = waveformOnly ? 16 : 8;
    ctx.shadowColor = `rgba(${tint[0]},${tint[1]},${tint[2]},${waveformOnly ? 0.45 : 0.3})`;
  }

  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
    else ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawShimmer(ctx, w, h, shimmer) {
  if (shimmer < 0.08) return;

  const alpha = Math.min(0.07, shimmer * 0.08);
  const y = h * 0.2 + Math.random() * h * 0.35;

  ctx.beginPath();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;
  ctx.moveTo(0, y);
  ctx.lineTo(w, y + (Math.random() - 0.5) * 6);
  ctx.stroke();
}

function computeRms(timeData) {
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / timeData.length);
  return clamp01(rms * 1.8);
}

function computeCentroidNorm(freqData, sr, fftSize) {
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < freqData.length; i++) {
    const mag = freqData[i] / 255;
    const freq = (i * sr) / fftSize;
    weighted += freq * mag;
    total += mag;
  }

  if (total <= 1e-6) return 0.2;
  const centroid = weighted / total;
  return clamp01(centroid / (sr / 2));
}

function computeLogBands(freqData, bandCount, bassEmphasis = 1) {
  const out = new Float32Array(bandCount);
  const minBin = 1;
  const maxBin = freqData.length - 1;

  for (let b = 0; b < bandCount; b++) {
    const t0 = b / bandCount;
    const t1 = (b + 1) / bandCount;

    const i0 = Math.floor(minBin * Math.pow(maxBin / minBin, t0));
    const i1 = Math.floor(minBin * Math.pow(maxBin / minBin, t1));

    let sum = 0;
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      sum += freqData[i] / 255;
      n += 1;
    }

    let v = n > 0 ? sum / n : 0;
    const bassBoost = 1 + (1 - b / bandCount) * (bassEmphasis - 1);
    v = Math.log1p(v * 7) / Math.log1p(7);
    out[b] = clamp01(v * bassBoost);
  }

  return out;
}

function computeShimmer(freqData) {
  const start = Math.floor(freqData.length * 0.72);
  let sum = 0;
  let n = 0;
  for (let i = start; i < freqData.length; i++) {
    sum += freqData[i] / 255;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

function extractWaveChunk(timeData, points = 8) {
  const out = [];
  const step = Math.max(1, Math.floor(timeData.length / points));

  let prev = 0;
  for (let i = 0; i < timeData.length; i += step) {
    let v = (timeData[i] - 128) / 128;
    v = Math.tanh(v * 1.5); // soft compression for peaks
    const smooth = prev * 0.62 + v * 0.38;
    out.push(smooth);
    prev = smooth;
    if (out.length >= points) break;
  }

  return out;
}

function movingAverage(values, win = 5) {
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let c = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(values.length - 1, i + win); j++) {
      sum += values[j];
      c += 1;
    }
    out[i] = c > 0 ? sum / c : 0;
  }
  return out;
}

function classifyMood(rms, centroid) {
  if (rms < 0.08) return 'Idle';
  if (rms > 0.65) return 'Surge';
  if (centroid < 0.24) return 'Warm';
  if (centroid > 0.5) return 'Bright';
  return 'Flow';
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function capitalize(text = '') {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
