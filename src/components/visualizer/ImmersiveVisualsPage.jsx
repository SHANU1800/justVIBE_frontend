import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../state/PlayerContext';

const FFT_SIZE = 1024;

const MOOD_PROFILE = {
  chill: {
    primary: [56, 189, 248],
    secondary: [125, 211, 252],
    speed: 0.85,
    energyBoost: 0.9,
    wobbleBoost: 0.9,
    barRange: { min: 0.0, max: 0.68 },
    rotationSpeed: 0.7,
    hotspotBoost: 0.22,
    hotspotWidth: 0.48,
    waveSpeed: 7.5,
    waveMix: 0.22,
    breathDepth: 0.045,
    spikeThreshold: 0.13,
    spikeDecay: 0.76,
    colorRange: {
      fromA: [56, 189, 248],
      toA: [34, 211, 238],
      fromB: [125, 211, 252],
      toB: [110, 231, 183],
      flowSpeed: 0.45,
      flowDepth: 0.08,
    },
  },
  focus: {
    primary: [52, 211, 153],
    secondary: [16, 185, 129],
    speed: 0.75,
    energyBoost: 0.85,
    wobbleBoost: 0.8,
    barRange: { min: 0.0, max: 0.58 },
    rotationSpeed: 0.55,
    hotspotBoost: 0.18,
    hotspotWidth: 0.44,
    waveSpeed: 6.2,
    waveMix: 0.2,
    breathDepth: 0.035,
    spikeThreshold: 0.15,
    spikeDecay: 0.8,
    colorRange: {
      fromA: [16, 185, 129],
      toA: [34, 197, 94],
      fromB: [94, 234, 212],
      toB: [110, 231, 183],
      flowSpeed: 0.38,
      flowDepth: 0.06,
    },
  },
  hype: {
    primary: [251, 146, 60],
    secondary: [248, 113, 113],
    speed: 1.25,
    energyBoost: 1.25,
    wobbleBoost: 1.35,
    barRange: { min: 0.0, max: 0.98 },
    rotationSpeed: 1.2,
    hotspotBoost: 0.34,
    hotspotWidth: 0.54,
    waveSpeed: 10.5,
    waveMix: 0.28,
    breathDepth: 0.06,
    spikeThreshold: 0.1,
    spikeDecay: 0.68,
    colorRange: {
      fromA: [249, 115, 22],
      toA: [251, 191, 36],
      fromB: [248, 113, 113],
      toB: [253, 186, 116],
      flowSpeed: 0.95,
      flowDepth: 0.13,
    },
  },
  romantic: {
    primary: [244, 114, 182],
    secondary: [192, 132, 252],
    speed: 0.9,
    energyBoost: 0.95,
    wobbleBoost: 1.0,
    barRange: { min: 0.0, max: 0.72 },
    rotationSpeed: 0.75,
    hotspotBoost: 0.24,
    hotspotWidth: 0.5,
    waveSpeed: 8.0,
    waveMix: 0.24,
    breathDepth: 0.05,
    spikeThreshold: 0.12,
    spikeDecay: 0.74,
    colorRange: {
      fromA: [236, 72, 153],
      toA: [244, 114, 182],
      fromB: [192, 132, 252],
      toB: [216, 180, 254],
      flowSpeed: 0.58,
      flowDepth: 0.1,
    },
  },
  melancholy: {
    primary: [96, 165, 250],
    secondary: [99, 102, 241],
    speed: 0.8,
    energyBoost: 0.88,
    wobbleBoost: 0.92,
    barRange: { min: 0.0, max: 0.64 },
    rotationSpeed: 0.5,
    hotspotBoost: 0.18,
    hotspotWidth: 0.42,
    waveSpeed: 5.8,
    waveMix: 0.18,
    breathDepth: 0.038,
    spikeThreshold: 0.16,
    spikeDecay: 0.82,
    colorRange: {
      fromA: [96, 165, 250],
      toA: [59, 130, 246],
      fromB: [129, 140, 248],
      toB: [147, 197, 253],
      flowSpeed: 0.34,
      flowDepth: 0.06,
    },
  },
  dreamy: {
    primary: [167, 139, 250],
    secondary: [129, 140, 248],
    speed: 1.05,
    energyBoost: 1.05,
    wobbleBoost: 1.15,
    barRange: { min: 0.0, max: 0.82 },
    rotationSpeed: 0.95,
    hotspotBoost: 0.28,
    hotspotWidth: 0.56,
    waveSpeed: 9.0,
    waveMix: 0.26,
    breathDepth: 0.055,
    spikeThreshold: 0.11,
    spikeDecay: 0.72,
    colorRange: {
      fromA: [167, 139, 250],
      toA: [129, 140, 248],
      fromB: [196, 181, 253],
      toB: [147, 197, 253],
      flowSpeed: 0.72,
      flowDepth: 0.11,
    },
  },
};

export default function ImmersiveVisualsPage({ userMood = 'chill' }) {
  const { audioRef, isPlaying, togglePlay, getSharedAnalyserNode, currentTrack } = usePlayer();
  const mood = MOOD_PROFILE[userMood] ?? MOOD_PROFILE.chill;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [beatsEnabled, setBeatsEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamSourceRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const freqDataRef = useRef(null);
  const smoothedBarsRef = useRef(null);
  const adaptiveGainRef = useRef(1.0);
  const prevAmpRef = useRef(null);
  const spikeRef = useRef(null);
  const trailBarsRef = useRef(null);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const motionRef = useRef({
    lastTs: 0,
    hotspotAngle: 0,
    rotation: 0,
    bassBreath: 0,
    prevBassEnergy: 0,
    prevHighEnergy: 0,
    beatPulse: 0,
    kickPulse: 0,
    snarePulse: 0,
    lastBeatTs: 0,
    lastBigBeatTs: 0,
    ripples: [],
  });

  const setupAudio = useCallback(() => {
    const audio = audioRef?.current;
    if (!audio) return;

    const sharedAnalyser = getSharedAnalyserNode?.();
    if (sharedAnalyser) {
      analyserRef.current = sharedAnalyser;
      if (!freqDataRef.current || freqDataRef.current.length !== sharedAnalyser.frequencyBinCount) {
        freqDataRef.current = new Uint8Array(sharedAnalyser.frequencyBinCount);
        smoothedBarsRef.current = new Float32Array(sharedAnalyser.frequencyBinCount);
        prevAmpRef.current = new Float32Array(sharedAnalyser.frequencyBinCount);
        spikeRef.current = new Float32Array(sharedAnalyser.frequencyBinCount);
        trailBarsRef.current = new Float32Array(sharedAnalyser.frequencyBinCount);
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
      analyserRef.current.smoothingTimeConstant = 0.78;
      freqDataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      smoothedBarsRef.current = new Float32Array(analyserRef.current.frequencyBinCount);
      prevAmpRef.current = new Float32Array(analyserRef.current.frequencyBinCount);
      spikeRef.current = new Float32Array(analyserRef.current.frequencyBinCount);
      trailBarsRef.current = new Float32Array(analyserRef.current.frequencyBinCount);
    }

    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audio);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      } catch {
        // If MediaElementSource is already connected elsewhere, use captureStream fallback.
        // This still provides real beat-reactive frequency data.
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
          // keep graceful visual fallback if browser blocks stream capture
        }
      }
    }
  }, [audioRef, getSharedAnalyserNode]);

  const resumeAudio = useCallback(() => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (container.requestFullscreen) {
        await container.requestFullscreen();
      }
    } catch {
      // keep visuals running even if browser denies fullscreen
    }
  }, []);

  useEffect(() => {
    setupAudio();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [setupAudio]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    onFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (isPlaying) resumeAudio();
  }, [isPlaying, resumeAudio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const frame = (ts) => {
      animationRef.current = requestAnimationFrame(frame);

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const freqData = freqDataRef.current;

      if (analyserRef.current && freqData) {
        analyserRef.current.getByteFrequencyData(freqData);
      } else if (freqData) {
        // Graceful fallback (still discrete bars) when no analyser stream is available.
        const t = ts * 0.001;
        for (let i = 0; i < freqData.length; i++) {
          const wave = 0.5 + 0.5 * Math.sin(t * (1.2 + (i % 9) * 0.1) + i * 0.08);
          freqData[i] = Math.floor(wave * (isPlaying ? 120 : 0));
        }
      }

      drawRadialBarsOnly(
        ctx,
        width,
        height,
        ts,
        freqData,
        smoothedBarsRef,
        adaptiveGainRef,
        prevAmpRef,
        spikeRef,
        trailBarsRef,
        motionRef,
        isPlaying,
        mood,
        beatsEnabled,
        reducedMotion,
      );
    };

    frame(performance.now());

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, mood, beatsEnabled, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="immersive-visuals-root"
      role="button"
      tabIndex={0}
      aria-label="Immersive song visual"
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          resumeAudio();
          togglePlay();
        }
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          toggleFullscreen();
        }
      }}
      title="Tap canvas, Space, or Play to toggle · F fullscreen"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 3rem)',
        overflow: 'hidden',
        background: '#020617',
        outline: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        role="presentation"
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'block',
          width: '100%',
          height: '100%',
          filter: 'saturate(1.2) contrast(1.06)',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          e.stopPropagation();
          resumeAudio();
          togglePlay();
        }}
      />

      {/* Now playing — subtle, does not compete with the canvas */}
      {currentTrack?.name && (
        <div
          className="pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 15,
            padding: '1rem 1.25rem 2.5rem',
            background: 'linear-gradient(to bottom, rgba(2,6,23,0.82) 0%, rgba(2,6,23,0) 100%)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(148,163,184,0.85)',
              marginBottom: '0.25rem',
            }}
          >
            Now playing
          </div>
          <div
            className="truncate max-w-[min(90vw,36rem)] mx-auto"
            style={{
              fontFamily: 'var(--font-display, system-ui)',
              fontSize: 'clamp(0.95rem, 2.2vw, 1.15rem)',
              fontWeight: 700,
              color: 'rgba(248,250,252,0.95)',
              textShadow: '0 1px 24px rgba(0,0,0,0.55)',
            }}
            title={currentTrack.name}
          >
            {currentTrack.name}
          </div>
        </div>
      )}

      <div
        className="pointer-events-none select-none"
        style={{
          position: 'absolute',
          top: '0.65rem',
          right: '0.75rem',
          zIndex: 16,
          fontSize: '10px',
          letterSpacing: '0.06em',
          color: 'rgba(148,163,184,0.55)',
          maxWidth: '11rem',
          textAlign: 'right',
          lineHeight: 1.35,
        }}
      >
        Tap canvas · Space · F
        {reducedMotion && (
          <span className="block mt-1 text-emerald-400/80">Reduced motion on</span>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          bottom: 0,
          zIndex: 20,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '0.75rem',
          paddingBottom: '2rem',
          paddingInline: '1rem',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          style={{
            borderRadius: '9999px',
            border: '1px solid rgba(148,163,184,0.28)',
            background: 'rgba(15,23,42,0.52)',
            color: 'rgba(226,232,240,0.95)',
            fontSize: '11px',
            letterSpacing: '0.09em',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '0.55rem 0.95rem',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          title="Toggle fullscreen (F)"
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
        <button
          type="button"
          style={{
            borderRadius: '9999px',
            border: '1px solid rgba(148,163,184,0.28)',
            background: 'rgba(15,23,42,0.52)',
            color: 'rgba(226,232,240,0.95)',
            fontSize: '11px',
            letterSpacing: '0.09em',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '0.55rem 0.95rem',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            resumeAudio();
            togglePlay();
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          style={{
            borderRadius: '9999px',
            border: '1px solid rgba(148,163,184,0.28)',
            background: beatsEnabled ? 'rgba(30,41,59,0.72)' : 'rgba(15,23,42,0.52)',
            color: 'rgba(226,232,240,0.95)',
            fontSize: '11px',
            letterSpacing: '0.09em',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '0.55rem 0.95rem',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setBeatsEnabled((prev) => !prev);
          }}
          title="Toggle beat-driven effects"
        >
          Beats {beatsEnabled ? 'On' : 'Off'}
        </button>
        <div
          style={{
            borderRadius: '9999px',
            border: '1px solid rgba(148,163,184,0.24)',
            background: 'rgba(15,23,42,0.44)',
            color: 'rgba(226,232,240,0.92)',
            fontSize: '11px',
            letterSpacing: '0.09em',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '0.5rem 0.9rem',
            backdropFilter: 'blur(8px)',
          }}
        >
          Mood {userMood}
        </div>
      </div>
    </div>
  );
}

function drawRadialBarsOnly(
  ctx,
  width,
  height,
  ts,
  freqData,
  smoothedBarsRef,
  adaptiveGainRef,
  prevAmpRef,
  spikeRef,
  trailBarsRef,
  motionRef,
  isPlaying,
  mood,
  beatsEnabled,
  reducedMotion = false,
) {
  const beatFx = beatsEnabled && !reducedMotion;
  const motionScale = reducedMotion ? 0.2 : 1;
  const time = ts * 0.001;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const minDim = Math.min(width, height);

  const totalBars = freqData?.length ?? 0;
  if (totalBars === 0) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  let smoothed = smoothedBarsRef.current;
  if (!smoothed || smoothed.length !== totalBars) {
    smoothed = new Float32Array(totalBars);
    smoothedBarsRef.current = smoothed;
  }

  let prevAmp = prevAmpRef.current;
  if (!prevAmp || prevAmp.length !== totalBars) {
    prevAmp = new Float32Array(totalBars);
    prevAmpRef.current = prevAmp;
  }

  let spikes = spikeRef.current;
  if (!spikes || spikes.length !== totalBars) {
    spikes = new Float32Array(totalBars);
    spikeRef.current = spikes;
  }

  let trails = trailBarsRef.current;
  if (!trails || trails.length !== totalBars) {
    trails = new Float32Array(totalBars);
    trailBarsRef.current = trails;
  }

  const motion = motionRef.current;
  const dt = motion.lastTs > 0 ? clamp((ts - motion.lastTs) / 1000, 0.001, 0.05) : 0.016;
  motion.lastTs = ts;

  ctx.clearRect(0, 0, width, height);

  // Clean background only.
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, 'rgba(2, 6, 23, 0.96)');
  bg.addColorStop(1, 'rgba(3, 12, 28, 0.99)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Bass breathing (subtle global radius modulation from low-frequency energy).
  const bassBins = Math.max(6, Math.floor(totalBars * 0.08));
  const highStart = Math.floor(totalBars * 0.52);
  const highEnd = Math.max(highStart + 1, Math.floor(totalBars * 0.9));
  let bassSum = 0;
  for (let i = 0; i < bassBins; i++) bassSum += (freqData[i] ?? 0) / 255;
  const bassEnergy = bassSum / bassBins;

  let highSum = 0;
  let highCount = 0;
  for (let i = highStart; i < highEnd; i++) {
    highSum += (freqData[i] ?? 0) / 255;
    highCount += 1;
  }
  const highEnergy = highCount > 0 ? highSum / highCount : 0;
  motion.bassBreath = lerp(motion.bassBreath ?? 0, bassEnergy, 0.08);

  // Beat pulse: instant pop on onset + fast decay back to normal.
  const prevBass = motion.prevBassEnergy ?? bassEnergy;
  const bassRise = bassEnergy - prevBass;
  motion.prevBassEnergy = lerp(prevBass, bassEnergy, 0.36);

  const prevHigh = motion.prevHighEnergy ?? highEnergy;
  const highRise = highEnergy - prevHigh;
  motion.prevHighEnergy = lerp(prevHigh, highEnergy, 0.32);

  // Split beat handling:
  // - small beats => ripple rings only
  // - big beats (rare) => circle movement pulse
  const minSmallBeatInterval = 0.11;
  const minBigBeatInterval = 0.34;
  const smallBeatReady = time - (motion.lastBeatTs ?? 0) > minSmallBeatInterval;
  const bigBeatReady = time - (motion.lastBigBeatTs ?? 0) > minBigBeatInterval;

  const smallOnset = isPlaying && smallBeatReady && (
    (bassEnergy > 0.12 && bassRise > 0.013) ||
    (highEnergy > 0.1 && highRise > 0.013)
  );

  const bigOnset = isPlaying && bigBeatReady && (
    (bassEnergy > 0.27 && bassRise > 0.028) ||
    (bassEnergy > 0.23 && bassRise > 0.045)
  );

  if (beatFx && (smallOnset || bigOnset)) {
    motion.lastBeatTs = time;
    const baseStrength = clamp(0.4 + bassEnergy * 0.55 + Math.max(0, bassRise) * 4.8, 0.35, 0.95);
    const rippleStrength = bigOnset ? clamp(baseStrength * 1.35, 0.5, 1.4) : baseStrength;
    const ripples = Array.isArray(motion.ripples) ? motion.ripples : [];
    ripples.push({
      bornAt: time,
      strength: rippleStrength,
      hueMix: clamp(0.45 + (highEnergy - bassEnergy) * 0.6, 0.1, 0.9),
    });
    if (ripples.length > 8) ripples.splice(0, ripples.length - 8);
    motion.ripples = ripples;
  }

  if (beatFx && bigOnset) {
    motion.beatPulse = 1;
    motion.lastBigBeatTs = time;
  }

  const kickOnset = isPlaying && (bassEnergy > 0.13 && bassRise > 0.016);
  const snareOnset = isPlaying && (highEnergy > 0.09 && highRise > 0.012);
  if (beatFx && kickOnset) motion.kickPulse = 1;
  if (beatFx && snareOnset) motion.snarePulse = 1;

  const beatDecayPerSec = isPlaying ? 8.4 : 12;
  motion.beatPulse = Math.max(0, (motion.beatPulse ?? 0) - (beatDecayPerSec * dt));
  motion.kickPulse = Math.max(0, (motion.kickPulse ?? 0) - ((isPlaying ? 7.2 : 11) * dt));
  motion.snarePulse = Math.max(0, (motion.snarePulse ?? 0) - ((isPlaying ? 9.4 : 13) * dt));
  const beatImpact = Math.pow(motion.beatPulse, 0.58);

  const warmPulse = Math.pow(motion.kickPulse ?? 0, 0.72);
  const coolPulse = Math.pow(motion.snarePulse ?? 0, 0.72);

  const baseRadius = minDim * 0.215;
  const beatExpand = 0.16;
  const innerRadius = baseRadius * (1 + beatImpact * beatExpand);
  const maxBarLen = minDim * 0.16;
  const targetVisibleBars = clamp(Math.floor(minDim * 0.52), 180, 300);
  const drawStride = Math.max(1, Math.round(totalBars / targetVisibleBars));
  const visibleBars = Math.max(1, Math.floor(totalBars / drawStride));
  const circumference = Math.PI * 2 * innerRadius;
  const barStep = circumference / visibleBars;
  // Slight overlap to remove tiny anti-aliased gaps between adjacent bars.
  const barWidth = Math.max(3.8, Math.min(9.5, barStep * 1.03));

  // Mood-dynamic color range: fluid within bounded palette per mood.
  const colorRange = mood.colorRange ?? {
    fromA: [59, 130, 246],
    toA: [34, 211, 238],
    fromB: [125, 211, 252],
    toB: [56, 189, 248],
    flowSpeed: 0.6,
    flowDepth: 0.1,
  };

  const globalFlow = 0.5 + 0.5 * Math.sin(time * colorRange.flowSpeed);
  const neonA = mixColor(colorRange.fromA, colorRange.toA, globalFlow);
  const neonB = mixColor(colorRange.fromB, colorRange.toB, globalFlow);
  const warmColor = [255, 153, 74];
  const coolColor = [96, 165, 250];
  const warmWeight = clamp(0.08 + warmPulse * 0.8, 0, 1);
  const coolWeight = clamp(0.08 + coolPulse * 0.8, 0, 1);
  const splitA = mixColor(mixColor(neonA, warmColor, warmWeight), coolColor, coolWeight * 0.65);
  const splitB = mixColor(mixColor(neonB, warmColor, warmWeight * 0.55), coolColor, coolWeight);
  const allowedColors = [
    colorRange.fromA,
    colorRange.toA,
    colorRange.fromB,
    colorRange.toB,
  ];
  const minAllowed = [
    Math.min(...allowedColors.map((c) => c[0])),
    Math.min(...allowedColors.map((c) => c[1])),
    Math.min(...allowedColors.map((c) => c[2])),
  ];
  const maxAllowed = [
    Math.max(...allowedColors.map((c) => c[0])),
    Math.max(...allowedColors.map((c) => c[1])),
    Math.max(...allowedColors.map((c) => c[2])),
  ];
  const clampedSplitA = clampColorToRange(splitA, minAllowed, maxAllowed);
  const clampedSplitB = clampColorToRange(splitB, minAllowed, maxAllowed);
  const glowBase = mixColor(clampedSplitA, clampedSplitB, 0.45);

  // Slow rotation + moving hotspot arc (explicitly mood-dependent).
  const rotationFactor = (mood.rotationSpeed ?? 0.8) * motionScale;
  motion.rotation = (motion.rotation + dt * 0.11 * rotationFactor) % (Math.PI * 2);
  motion.hotspotAngle = (motion.hotspotAngle + dt * 0.22 * rotationFactor) % (Math.PI * 2);
  const globalRotation = motion.rotation;

  const hotspotBoost = mood.hotspotBoost ?? 0.24;
  const hotspotWidth = mood.hotspotWidth ?? 0.5;

  const moodRangeMin = clamp(mood.barRange?.min ?? 0.02, 0, 1);
  const moodRangeMax = clamp(mood.barRange?.max ?? 0.8, moodRangeMin, 1);
  const dampingRise = isPlaying ? 0.22 : 0.1;
  const dampingFall = isPlaying ? 0.18 : 0.16;

  // Persistent circular border (visible at rest and during playback).
  const borderAlpha = isPlaying ? 0.66 : 0.44;
  const borderWidth = Math.max(5.2, minDim * 0.0082);
  const pulseGlow = reducedMotion ? 0.45 : (0.4 + beatImpact * 0.75);
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = `rgba(${mood.secondary[0]}, ${mood.secondary[1]}, ${mood.secondary[2]}, ${borderAlpha})`;
  ctx.shadowBlur = (isPlaying ? 8 : 4) + (reducedMotion ? 0 : beatImpact * 11);
  ctx.shadowColor = `rgba(${mood.primary[0]}, ${mood.primary[1]}, ${mood.primary[2]}, ${pulseGlow})`;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Beat ripple rings: short-lived outward rings for rhythm readability.
  const rippleLifetime = 0.36;
  const activeRipples = [];
  const sourceRipples = Array.isArray(motion.ripples) ? motion.ripples : [];
  for (let i = 0; i < sourceRipples.length; i++) {
    const ripple = sourceRipples[i];
    const age = time - ripple.bornAt;
    if (age < 0 || age > rippleLifetime) continue;

    const life = age / rippleLifetime;
    const easeOut = 1 - Math.pow(1 - life, 2.4);
    const radius = innerRadius + (minDim * (0.12 + 0.06 * ripple.strength)) * easeOut;
    const alpha = (1 - life) * (0.26 + ripple.strength * 0.14);
    const ringWidth = 1.6 + (1 - life) * (2.4 + ripple.strength * 1.1);
    const ringColor = clampColorToRange(
      mixColor(clampedSplitA, clampedSplitB, ripple.hueMix ?? 0.5),
      minAllowed,
      maxAllowed,
    );

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = ringWidth;
    ctx.strokeStyle = `rgba(${ringColor[0]}, ${ringColor[1]}, ${ringColor[2]}, ${alpha})`;
    ctx.shadowBlur = 7 + (1 - life) * 8;
    ctx.shadowColor = `rgba(${ringColor[0]}, ${ringColor[1]}, ${ringColor[2]}, ${Math.min(0.46, alpha + 0.16)})`;
    ctx.stroke();
    ctx.shadowBlur = 0;

    activeRipples.push(ripple);
  }
  motion.ripples = activeRipples;

  // ── Frame analysis for adaptive dynamics ───────────────────────────
  let frameMin = 1;
  let frameMax = 0;
  let frameSum = 0;
  for (let i = 0; i < totalBars; i++) {
    const v = (freqData[i] ?? 0) / 255;
    frameMin = Math.min(frameMin, v);
    frameMax = Math.max(frameMax, v);
    frameSum += v;
  }

  const frameAvg = frameSum / totalBars;
  const dynamicRange = Math.max(0.02, frameMax - frameMin);

  // Adaptive gain: aim for stable mid-level movement while preserving peaks
  const targetAvg = isPlaying ? 0.24 : 0.08;
  const desiredGain = clamp(targetAvg / Math.max(0.03, frameAvg), 0.45, 1.2);
  const prevGain = adaptiveGainRef.current ?? 1.0;
  const gainSmoothing = isPlaying ? 0.12 : 0.08;
  const adaptiveGain = prevGain + (desiredGain - prevGain) * gainSmoothing;
  adaptiveGainRef.current = adaptiveGain;

  const ampThreshold = isPlaying ? 0.14 : 0.2;

  const waveSpeedBins = mood.waveSpeed ?? 8;
  const waveMix = clamp((mood.waveMix ?? 0.22) * (reducedMotion ? 0.45 : 1), 0, 0.45);
  const waveShift = (time * waveSpeedBins) % totalBars;

  const baseAmp = new Float32Array(totalBars);

  // First pass: compute base normalized amplitudes from FFT.
  for (let i = 0; i < totalBars; i++) {
    const raw = (freqData[i] ?? 0) / 255;
    const normalized = dynamicRange < 0.03 ? 0 : (raw - frameMin) / dynamicRange;
    const gained = normalized * adaptiveGain * mood.energyBoost;
    const softSat = 1 - Math.exp(-1.8 * Math.max(0, gained));
    const thresholded = softSat <= ampThreshold
      ? 0
      : (softSat - ampThreshold) / (1 - ampThreshold);
    baseAmp[i] = Math.pow(thresholded, 1.08);
  }

  for (let i = 0; i < totalBars; i += drawStride) {
    // Wave travel via slight neighboring delay propagation.
    const delayed = sampleCircular(baseAmp, i - waveShift);
    const waved = lerp(baseAmp[i], delayed, waveMix);

    // Spike moments on transients (fast rise, quick decay).
    const delta = waved - prevAmp[i];
    const spikeThreshold = mood.spikeThreshold ?? 0.12;
    const spikeDecay = mood.spikeDecay ?? 0.72;
    const impulse = delta > spikeThreshold ? (delta - spikeThreshold) * 2.2 : 0;
    spikes[i] = Math.max(spikes[i] * spikeDecay, impulse);
    prevAmp[i] = prevAmp[i] + (waved - prevAmp[i]) * 0.35;

    // Moving hotspot arc intensity boost.
    const baseAngle = (i / totalBars) * Math.PI * 2;
    const angle = baseAngle + globalRotation;
    const dist = angularDistance(angle, motion.hotspotAngle);
    const hotspotFactor = 1 + hotspotBoost * Math.exp(-(dist * dist) / (2 * hotspotWidth * hotspotWidth));

    const ampRaw = clamp((waved * hotspotFactor) + spikes[i], 0, 1);
    const amp = moodRangeMin + ampRaw * (moodRangeMax - moodRangeMin);

    const prev = smoothed[i] ?? 0;
    const damping = amp > prev ? dampingRise : dampingFall;
    const smoothAmp = prev + (amp - prev) * damping;
    smoothed[i] = smoothAmp;

    const barLen = smoothAmp * maxBarLen;
    if (barLen <= 0.25) continue;

    const baseMix = i / Math.max(1, totalBars - 1);
    const drift = Math.sin(time * colorRange.flowSpeed * 1.6 + i * 0.045) * (colorRange.flowDepth ?? 0.1);
    const mix = clamp(baseMix + drift, 0.04, 0.96);
    const highBias = Math.pow(i / Math.max(1, totalBars - 1), 1.15);
    const localWarm = warmWeight * (1 - highBias);
    const localCool = coolWeight * (0.35 + highBias * 0.65);
    const cA = clampColorToRange(mixColor(clampedSplitA, warmColor, localWarm * 0.45), minAllowed, maxAllowed);
    const cB = clampColorToRange(mixColor(clampedSplitB, coolColor, localCool * 0.55), minAllowed, maxAllowed);
    const mixedColor = clampColorToRange(
      [
        Math.round(cA[0] + (cB[0] - cA[0]) * mix),
        Math.round(cA[1] + (cB[1] - cA[1]) * mix),
        Math.round(cA[2] + (cB[2] - cA[2]) * mix),
      ],
      minAllowed,
      maxAllowed,
    );
    const r = mixedColor[0];
    const g = mixedColor[1];
    const b = mixedColor[2];

    const trailTarget = clamp(barLen, 0, maxBarLen);
    const trailDecay = Math.exp(-dt / 0.3); // ~300ms trail memory
    trails[i] = Math.max(trails[i] * trailDecay, trailTarget);
    const trailLen = trails[i];

    if (trailLen > barLen + 0.35) {
      drawRadialBarSegment(
        ctx,
        cx,
        cy,
        angle,
        innerRadius,
        trailLen,
        barWidth + 1.0,
        `rgba(${r}, ${g}, ${b}, ${0.08 + smoothAmp * 0.11})`,
      );
    }

    // Soft glow fill behind the core bar.
    ctx.shadowBlur = 4 + smoothAmp * 5;
    ctx.shadowColor = `rgba(${glowBase[0]}, ${glowBase[1]}, ${glowBase[2]}, 0.36)`;
    drawRadialBarSegment(
      ctx,
      cx,
      cy,
      angle,
      innerRadius,
      barLen,
      barWidth + 1.2,
      `rgba(${r}, ${g}, ${b}, ${0.2 + smoothAmp * 0.34})`,
    );

    // Core crisp bar.
    ctx.shadowBlur = 0;
    drawRadialBarSegment(
      ctx,
      cx,
      cy,
      angle,
      innerRadius,
      barLen,
      barWidth,
      `rgba(${r}, ${g}, ${b}, ${0.82 + smoothAmp * 0.16})`,
    );
  }
}

function drawRadialBarSegment(ctx, cx, cy, angle, innerRadius, length, width, fillStyle) {
  if (length <= 0 || width <= 0) return;

  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const tx = -uy;
  const ty = ux;
  const hw = width * 0.5;

  const ix = cx + ux * innerRadius;
  const iy = cy + uy * innerRadius;
  const ox = cx + ux * (innerRadius + length);
  const oy = cy + uy * (innerRadius + length);

  const p1x = ix + tx * hw;
  const p1y = iy + ty * hw;
  const p2x = ox + tx * hw;
  const p2y = oy + ty * hw;
  const p3x = ox - tx * hw;
  const p3y = oy - ty * hw;
  const p4x = ix - tx * hw;
  const p4y = iy - ty * hw;

  ctx.beginPath();
  ctx.moveTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.lineTo(p3x, p3y);
  ctx.lineTo(p4x, p4y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sampleCircular(arr, index) {
  const len = arr.length;
  if (!len) return 0;
  const wrapped = ((index % len) + len) % len;
  const i0 = Math.floor(wrapped);
  const i1 = (i0 + 1) % len;
  const t = wrapped - i0;
  return lerp(arr[i0], arr[i1], t);
}

function angularDistance(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = (Math.PI * 2) - d;
  return d;
}

function mixColor(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function clampColorToRange(color, minColor, maxColor) {
  return [
    clamp(color[0], minColor[0], maxColor[0]),
    clamp(color[1], minColor[1], maxColor[1]),
    clamp(color[2], minColor[2], maxColor[2]),
  ];
}
