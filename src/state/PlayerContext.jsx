import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';

const PlayerContext = createContext(null);

const initialState = {
  playlist: [],
  currentTrackIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  repeat: 'none', // none, one, all
  shuffle: false,
};

const MOOD_PRESETS = {
  chill: {
    dry: 0.2,
    wet: 1.0,
    lowShelf: { freq: 180, gain: 6 },
    peaking: { freq: 1200, q: 0.7, gain: -2.5 },
    highShelf: { freq: 5200, gain: -6 },
  },
  focus: {
    dry: 0.35,
    wet: 0.9,
    lowShelf: { freq: 180, gain: -2 },
    peaking: { freq: 2300, q: 1.0, gain: 4.5 },
    highShelf: { freq: 6200, gain: 3.5 },
  },
  hype: {
    dry: 0.15,
    wet: 1.0,
    lowShelf: { freq: 140, gain: 8.5 },
    peaking: { freq: 2600, q: 1.1, gain: 3.8 },
    highShelf: { freq: 7800, gain: 6.5 },
  },
  romantic: {
    dry: 0.25,
    wet: 0.95,
    lowShelf: { freq: 200, gain: 3.5 },
    peaking: { freq: 1500, q: 0.75, gain: 6 },
    highShelf: { freq: 6200, gain: 1.8 },
  },
  melancholy: {
    dry: 0.3,
    wet: 0.92,
    lowShelf: { freq: 170, gain: 2.5 },
    peaking: { freq: 1800, q: 0.8, gain: -3.2 },
    highShelf: { freq: 5400, gain: -4.8 },
  },
  dreamy: {
    dry: 0.18,
    wet: 1.0,
    lowShelf: { freq: 160, gain: 4.5 },
    peaking: { freq: 980, q: 0.6, gain: 2.8 },
    highShelf: { freq: 4900, gain: -2.2 },
  },
};

const DEFAULT_MODE_ADJUST = {
  low: 0,
  mid: 0,
  high: 0,
  wetBias: 0,
  dryBias: 0,
};

const DEFAULT_MODE_TONE = {
  lowFreqMul: 1,
  midFreqMul: 1,
  highFreqMul: 1,
  peakQMul: 1,
  lowpassHz: 22000,
  highpassHz: 20,
};

const DEFAULT_MODE_TEXTURE = {
  drive: 0,
  hiss: 0,
  crackle: 0,
  wowDepth: 0,
  flutterDepth: 0,
};

const DEFAULT_USER_EQ = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const DEFAULT_BASS_SETTINGS = { boost: 0, freq: 100 };
const DEFAULT_STEREO_SETTINGS = { width: 100, balance: 0 };
const DEFAULT_REVERB_SETTINGS = { amount: 0, decay: 2.5 };
const DEFAULT_NORM_SETTINGS = { enabled: false, target: -14 };

function normalizeUserEQ(values = []) {
  const arr = Array.isArray(values) ? values : [];
  const out = DEFAULT_USER_EQ.map((_, idx) => Number(arr[idx] ?? 0));
  return out.map(v => (Number.isFinite(v) ? clamp(v, -12, 12) : 0));
}

function userEqToMix(values = DEFAULT_USER_EQ) {
  const v = normalizeUserEQ(values);
  const avg = (idxs) => idxs.reduce((sum, i) => sum + (v[i] ?? 0), 0) / idxs.length;
  return {
    low: avg([0, 1, 2, 3]),
    mid: avg([4, 5, 6]),
    high: avg([7, 8, 9]),
  };
}

function makeDriveCurve(amount = 0) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  if (amount <= 0) {
    for (let i = 0; i < samples; i++) {
      curve[i] = (i * 2) / (samples - 1) - 1;
    }
    return curve;
  }
  const k = Math.max(0, amount) * 70;
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildImpulseResponse(ctx, decaySeconds = 2.5) {
  const decay = clamp(decaySeconds, 0.2, 8);
  const length = Math.max(1, Math.floor(ctx.sampleRate * decay));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, 2.6);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return impulse;
}

function playerReducer(state, action) {
  switch (action.type) {
    case 'SET_PLAYLIST':
      return { ...state, playlist: action.payload, currentTrackIndex: 0 };
    case 'ADD_TRACKS':
      return { ...state, playlist: [...state.playlist, ...action.payload] };
    case 'SET_TRACK_INDEX':
      return { ...state, currentTrackIndex: action.payload, currentTime: 0 };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'SET_TIME':
      return { ...state, currentTime: action.payload };
    case 'SET_DURATION':
      return { ...state, duration: action.payload };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload, isMuted: action.payload === 0 };
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted };
    case 'TOGGLE_SHUFFLE':
      return { ...state, shuffle: !state.shuffle };
    case 'CYCLE_REPEAT': {
      const modes = ['none', 'all', 'one'];
      const idx = modes.indexOf(state.repeat);
      return { ...state, repeat: modes[(idx + 1) % modes.length] };
    }
    case 'REMOVE_TRACK': {
      const newPlaylist = state.playlist.filter((_, i) => i !== action.payload);
      let newIndex = state.currentTrackIndex;
      if (action.payload < newIndex) newIndex--;
      else if (action.payload === newIndex) newIndex = Math.min(newIndex, newPlaylist.length - 1);
      return { ...state, playlist: newPlaylist, currentTrackIndex: newIndex };
    }
    default:
      return state;
  }
}

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef = useRef(new Audio());
  const playbackRateRef = useRef(1);
  const rateRafRef = useRef(null);
  const fxRef = useRef({
    ctx: null,
    source: null,
    analyser: null,
    processedAnalyser: null,
    mixBus: null,
    inputGain: null,
    lowShelf: null,
    peaking: null,
    highShelf: null,
    driveGain: null,
    modeDrive: null,
    postDriveGain: null,
    modeLowpass: null,
    modeHighpass: null,
    hissGain: null,
    crackleGain: null,
    wowDepth: null,
    flutterDepth: null,
    wetGain: null,
    dryGain: null,
    bassShelf: null,
    stereoSplitter: null,
    stereoMerge: null,
    stereoLDirectGain: null,
    stereoRCrossToLGain: null,
    stereoRDirectGain: null,
    stereoLCrossToRGain: null,
    stereoPanner: null,
    reverbConvolver: null,
    reverbDryGain: null,
    reverbWetGain: null,
    reverbMixBus: null,
    normCompressor: null,
    normMakeupGain: null,
    lastReverbDecay: null,
    lastReverbUpdateTs: 0,
  });
  const currentMoodRef = useRef('chill');
  const modeAdjustRef = useRef({ ...DEFAULT_MODE_ADJUST });
  const modeToneRef = useRef({ ...DEFAULT_MODE_TONE });
  const modeTextureRef = useRef({ ...DEFAULT_MODE_TEXTURE });
  const userEqRef = useRef([...DEFAULT_USER_EQ]);
  const subBassFilterRef = useRef(false);
  const bassSettingsRef = useRef({ ...DEFAULT_BASS_SETTINGS });
  const stereoSettingsRef = useRef({ ...DEFAULT_STEREO_SETTINGS });
  const reverbSettingsRef = useRef({ ...DEFAULT_REVERB_SETTINGS });
  const normSettingsRef = useRef({ ...DEFAULT_NORM_SETTINGS });
  const intensityRef = useRef(100);   // 0-200, percentage multiplier on EQ gains
  const prevDriveRef = useRef(0);

  const currentTrack = state.playlist[state.currentTrackIndex] || null;

  const ensureFxGraph = useCallback(() => {
    const audio = audioRef.current;
    const fx = fxRef.current;

    if (!fx.ctx || fx.ctx.state === 'closed') {
      fx.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!fx.source) {
      try {
        fx.source = fx.ctx.createMediaElementSource(audio);

        fx.inputGain = fx.ctx.createGain();
        fx.analyser = fx.ctx.createAnalyser();
        fx.analyser.fftSize = 1024;
        fx.analyser.smoothingTimeConstant = 0.78;
        fx.processedAnalyser = fx.ctx.createAnalyser();
        fx.processedAnalyser.fftSize = 1024;
        fx.processedAnalyser.smoothingTimeConstant = 0.78;
        fx.mixBus = fx.ctx.createGain();
        fx.lowShelf = fx.ctx.createBiquadFilter();
        fx.lowShelf.type = 'lowshelf';
        fx.peaking = fx.ctx.createBiquadFilter();
        fx.peaking.type = 'peaking';
        fx.highShelf = fx.ctx.createBiquadFilter();
        fx.highShelf.type = 'highshelf';
        fx.bassShelf = fx.ctx.createBiquadFilter();
        fx.bassShelf.type = 'lowshelf';
        fx.driveGain = fx.ctx.createGain();
        fx.modeDrive = fx.ctx.createWaveShaper();
        fx.modeDrive.oversample = '4x';
        fx.modeDrive.curve = makeDriveCurve(0);
        fx.postDriveGain = fx.ctx.createGain();
        fx.modeLowpass = fx.ctx.createBiquadFilter();
        fx.modeLowpass.type = 'lowpass';
        fx.modeHighpass = fx.ctx.createBiquadFilter();
        fx.modeHighpass.type = 'highpass';
        fx.hissGain = fx.ctx.createGain();
        fx.crackleGain = fx.ctx.createGain();
        fx.wowDepth = fx.ctx.createGain();
        fx.flutterDepth = fx.ctx.createGain();

        fx.wetGain = fx.ctx.createGain();
        fx.dryGain = fx.ctx.createGain();

  fx.stereoSplitter = fx.ctx.createChannelSplitter(2);
  fx.stereoMerge = fx.ctx.createChannelMerger(2);
  fx.stereoLDirectGain = fx.ctx.createGain();
  fx.stereoRCrossToLGain = fx.ctx.createGain();
  fx.stereoRDirectGain = fx.ctx.createGain();
  fx.stereoLCrossToRGain = fx.ctx.createGain();
  fx.stereoPanner = fx.ctx.createStereoPanner();

  fx.reverbConvolver = fx.ctx.createConvolver();
  fx.reverbDryGain = fx.ctx.createGain();
  fx.reverbWetGain = fx.ctx.createGain();
  fx.reverbMixBus = fx.ctx.createGain();

  fx.normCompressor = fx.ctx.createDynamicsCompressor();
  fx.normMakeupGain = fx.ctx.createGain();

        fx.source.connect(fx.analyser);

        fx.analyser.connect(fx.dryGain);
        fx.dryGain.connect(fx.mixBus);

        fx.analyser.connect(fx.inputGain);
        fx.inputGain.connect(fx.lowShelf);
        fx.lowShelf.connect(fx.peaking);
        fx.peaking.connect(fx.highShelf);
        fx.highShelf.connect(fx.bassShelf);
        fx.bassShelf.connect(fx.driveGain);
        fx.driveGain.connect(fx.modeDrive);
        fx.modeDrive.connect(fx.postDriveGain);
        fx.postDriveGain.connect(fx.modeLowpass);
        fx.modeLowpass.connect(fx.modeHighpass);
        fx.modeHighpass.connect(fx.wetGain);
        fx.wetGain.connect(fx.mixBus);

        fx.mixBus.connect(fx.stereoSplitter);
        fx.stereoSplitter.connect(fx.stereoLDirectGain, 0);
        fx.stereoSplitter.connect(fx.stereoRCrossToLGain, 1);
        fx.stereoSplitter.connect(fx.stereoRDirectGain, 1);
        fx.stereoSplitter.connect(fx.stereoLCrossToRGain, 0);

        fx.stereoLDirectGain.connect(fx.stereoMerge, 0, 0);
        fx.stereoRCrossToLGain.connect(fx.stereoMerge, 0, 0);
        fx.stereoRDirectGain.connect(fx.stereoMerge, 0, 1);
        fx.stereoLCrossToRGain.connect(fx.stereoMerge, 0, 1);

        fx.stereoMerge.connect(fx.stereoPanner);

        fx.stereoPanner.connect(fx.reverbDryGain);
        fx.reverbDryGain.connect(fx.reverbMixBus);
        fx.stereoPanner.connect(fx.reverbConvolver);
        fx.reverbConvolver.connect(fx.reverbWetGain);
        fx.reverbWetGain.connect(fx.reverbMixBus);

        fx.reverbMixBus.connect(fx.normCompressor);
        fx.normCompressor.connect(fx.normMakeupGain);
        fx.normMakeupGain.connect(fx.processedAnalyser);
        fx.processedAnalyser.connect(fx.ctx.destination);

        fx.hissGain.gain.value = 0;
        fx.crackleGain.gain.value = 0;
        fx.wowDepth.gain.value = 0;
        fx.flutterDepth.gain.value = 0;
        fx.driveGain.gain.value = 1;
        fx.postDriveGain.gain.value = 1;

        fx.bassShelf.frequency.value = 100;
        fx.bassShelf.gain.value = 0;

        fx.stereoLDirectGain.gain.value = 1;
        fx.stereoRCrossToLGain.gain.value = 0;
        fx.stereoRDirectGain.gain.value = 1;
        fx.stereoLCrossToRGain.gain.value = 0;
        fx.stereoPanner.pan.value = 0;

        fx.reverbDryGain.gain.value = 1;
        fx.reverbWetGain.gain.value = 0;
        fx.lastReverbDecay = null;
        fx.lastReverbUpdateTs = 0;
        fx.reverbConvolver.buffer = buildImpulseResponse(fx.ctx, 2.5);

        fx.normCompressor.threshold.value = -6;
        fx.normCompressor.knee.value = 16;
        fx.normCompressor.ratio.value = 1;
        fx.normCompressor.attack.value = 0.012;
        fx.normCompressor.release.value = 0.25;
        fx.normMakeupGain.gain.value = 1;
      } catch {
        // Another part of app may already own the media source.
      }
    }

    if (fx.ctx?.state === 'suspended') {
      fx.ctx.resume().catch(() => {});
    }

    return fx;
  }, []);

  const applyCompositePreset = useCallback((mood) => {
    const preset = MOOD_PRESETS[mood] || MOOD_PRESETS.chill;
    const modeAdjust = modeAdjustRef.current || DEFAULT_MODE_ADJUST;
    const modeTone = modeToneRef.current || DEFAULT_MODE_TONE;
    const modeTexture = modeTextureRef.current || DEFAULT_MODE_TEXTURE;
    const userMix = userEqToMix(userEqRef.current);
    const fx = ensureFxGraph();
    if (!fx.lowShelf || !fx.peaking || !fx.highShelf || !fx.wetGain || !fx.dryGain) return;

    const now = fx.ctx.currentTime;
    const ramp = 0.55; // longer ramp masks parameter-change clicks better

    // Intensity multiplier (0–200%, default 100%)
    const intensity = clamp((intensityRef.current ?? 100) / 100, 0, 2);

    const rawDry = clamp(preset.dry + modeAdjust.dryBias, 0.0, 1.2);
    const rawWet = clamp(preset.wet + modeAdjust.wetBias, 0.0, 0.72);
    const totalMix = rawDry + rawWet;
    const mixScale = totalMix > 1.0 ? (1.0 / totalMix) : 1.0;
    const targetDry = rawDry * mixScale;
    const targetWet = rawWet * mixScale;

    const userEqInfluence = 0.6;
    // Scale EQ gains by intensity — at 0% the curve is completely flat
    const rawLow  = (preset.lowShelf.gain  + modeAdjust.low  + (userMix.low  * userEqInfluence)) * intensity;
    const rawMid  = (preset.peaking.gain   + modeAdjust.mid  + (userMix.mid  * userEqInfluence)) * intensity;
    const rawHigh = (preset.highShelf.gain + modeAdjust.high + (userMix.high * userEqInfluence)) * intensity;
    const targetLow  = clamp(rawLow,  -12, 12);
    const targetMid  = clamp(rawMid,  -12, 12);
    const targetHigh = clamp(rawHigh, -12, 12);

    const maxBoost = Math.max(0, targetLow, targetMid, targetHigh);
    const headroom = clamp(1 - maxBoost * 0.035, 0.68, 1);
    const safeDry = targetDry * headroom;
    const safeWet = targetWet * headroom;

    const targetLowFreq  = clamp(preset.lowShelf.freq  * (modeTone.lowFreqMul  ?? 1), 60, 1200);
    const targetMidFreq  = clamp(preset.peaking.freq   * (modeTone.midFreqMul  ?? 1), 250, 6000);
    const targetHighFreq = clamp(preset.highShelf.freq * (modeTone.highFreqMul ?? 1), 1800, 12000);
    const targetQ        = clamp(preset.peaking.q      * (modeTone.peakQMul    ?? 1), 0.35, 2.0);
    const targetLowpass  = clamp(modeTone.lowpassHz  ?? 16500, 1200, 16500);
    const minHighpass    = subBassFilterRef.current ? 30 : 20;
    const targetHighpass = clamp(Math.max(modeTone.highpassHz ?? 20, minHighpass), 20, 350);
    const targetDrive    = clamp(modeTexture.drive   ?? 0, 0, 1);
    const targetHiss     = clamp(modeTexture.hiss    ?? 0, 0, 0.0012);
    const targetCrackle  = clamp(modeTexture.crackle ?? 0, 0, 0.0009);
    const targetWow      = clamp(modeTexture.wowDepth    ?? 0, 0, 620);
    const targetFlutter  = clamp(modeTexture.flutterDepth ?? 0, 0, 210);

    // ── Brief master dip (≈10%) masks any click at the start of transitions ──
    // Inaudible as a level change but prevents audible discontinuities.
    {
      const g = fx.mixBus.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.90, now + 0.022);
      g.linearRampToValueAtTime(1.0,  now + 0.18);
    }

    // snapAndRamp: cancel + anchor current value + ramp (for gain/Q params)
    const snapAndRamp = (param, target) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(target, now + ramp);
    };

    // snapAndRampExp: for frequency params — exponential sounds smoother
    // (frequency is perceptually logarithmic; avoids harsh audible sweeps)
    const snapAndRampExp = (param, target) => {
      const safeTarget = Math.max(target, 1);
      param.cancelScheduledValues(now);
      const curr = Math.max(param.value, 1);
      param.setValueAtTime(curr, now);
      param.exponentialRampToValueAtTime(safeTarget, now + ramp);
    };

    snapAndRamp(fx.dryGain.gain, safeDry);
    snapAndRamp(fx.wetGain.gain, safeWet);

    snapAndRampExp(fx.lowShelf.frequency, targetLowFreq);
    snapAndRamp(fx.lowShelf.gain, targetLow);

    snapAndRampExp(fx.peaking.frequency, targetMidFreq);
    snapAndRamp(fx.peaking.Q, targetQ);
    snapAndRamp(fx.peaking.gain, targetMid);

    snapAndRampExp(fx.highShelf.frequency, targetHighFreq);
    snapAndRamp(fx.highShelf.gain, targetHigh);

    if (fx.modeLowpass)  snapAndRampExp(fx.modeLowpass.frequency,  targetLowpass);
    if (fx.modeHighpass) snapAndRampExp(fx.modeHighpass.frequency, targetHighpass);

    // ── WaveShaper drive: gate via driveGain to prevent curve-swap click ──
    const prevDrive = prevDriveRef.current ?? 0;
    const driveDelta = Math.abs(targetDrive - prevDrive);
    if (fx.modeDrive && driveDelta > 0.02) {
      const gp = fx.driveGain.gain;
      gp.cancelScheduledValues(now);
      gp.setValueAtTime(gp.value, now);
      gp.linearRampToValueAtTime(0.001, now + 0.010);  // silence in 10 ms
      gp.setValueAtTime(0.001, now + 0.016);            // hold 6 ms
      gp.linearRampToValueAtTime(1 + targetDrive * 1.4, now + ramp);
      const capturedDrive = targetDrive;
      const capturedNode  = fx.modeDrive;
      setTimeout(() => { capturedNode.curve = makeDriveCurve(capturedDrive); }, 14);
      prevDriveRef.current = targetDrive;
    } else {
      if (fx.driveGain) snapAndRamp(fx.driveGain.gain, 1 + targetDrive * 1.4);
    }
    if (fx.postDriveGain) snapAndRamp(fx.postDriveGain.gain, 1 / (1 + targetDrive * 1.2));
    if (fx.hissGain)    snapAndRamp(fx.hissGain.gain,    targetHiss);
    if (fx.crackleGain) snapAndRamp(fx.crackleGain.gain, targetCrackle);
    if (fx.wowDepth)    snapAndRamp(fx.wowDepth.gain,    targetWow);
    if (fx.flutterDepth) snapAndRamp(fx.flutterDepth.gain, targetFlutter);
  }, [ensureFxGraph]);

  const getSharedAnalyserNode = useCallback(() => {
    const fx = ensureFxGraph();
    return fx?.processedAnalyser || fx?.analyser || null;
  }, [ensureFxGraph]);

  const getAnalyserNode = useCallback((type = 'processed') => {
    const fx = ensureFxGraph();
    if (!fx) return null;
    if (type === 'original') return fx.analyser || null;
    return fx.processedAnalyser || fx.analyser || null;
  }, [ensureFxGraph]);

  const applyMoodPreset = useCallback((mood) => {
    currentMoodRef.current = mood || 'chill';
    applyCompositePreset(currentMoodRef.current);
  }, [applyCompositePreset]);

  const applyListeningMode = useCallback((mode, recommendation = null) => {
    const normalized = (mode || 'Normal').toLowerCase();
    let nextAdjust = { ...DEFAULT_MODE_ADJUST };
    let nextTone = { ...DEFAULT_MODE_TONE };
    let nextTexture = { ...DEFAULT_MODE_TEXTURE };

    if (normalized === 'enhanced') {
      // Safer enhanced profile to avoid hiss/harshness on bright tracks.
      nextAdjust = { low: 2.2, mid: 0.9, high: 1.3, wetBias: 0.05, dryBias: -0.02 };
      nextTone = { ...DEFAULT_MODE_TONE, lowFreqMul: 1.03, midFreqMul: 1.03, highFreqMul: 1.01, peakQMul: 1.02, lowpassHz: 15500, highpassHz: 26 };
    } else if (normalized === 'lo-fi' || normalized === 'lofi') {
      nextAdjust = { low: 2.8, mid: -2.2, high: -5.8, wetBias: 0.16, dryBias: -0.08 };
      nextTone = { ...DEFAULT_MODE_TONE, lowFreqMul: 0.96, midFreqMul: 0.93, highFreqMul: 0.84, peakQMul: 0.92, lowpassHz: 6500, highpassHz: 55 };
      nextTexture = { ...DEFAULT_MODE_TEXTURE };
    } else if (normalized === 'dj') {
      nextAdjust = { low: 4.8, mid: -1.0, high: 3.5, wetBias: 0.14, dryBias: -0.06 };
      nextTone = { ...DEFAULT_MODE_TONE, lowFreqMul: 1.1, midFreqMul: 1.01, highFreqMul: 1.08, peakQMul: 1.08, lowpassHz: 17000, highpassHz: 35 };
      nextTexture = { ...DEFAULT_MODE_TEXTURE };
    }

    if (recommendation?.mix) {
      const mLow = recommendation.mix.low ?? 0;
      const mMid = recommendation.mix.mid ?? 0;
      const mHigh = recommendation.mix.high ?? 0;
      nextAdjust = {
        low: clamp(nextAdjust.low + mLow * 1.25, -13, 13),
        mid: clamp(nextAdjust.mid + mMid * 1.15, -13, 13),
        high: clamp(nextAdjust.high + mHigh * 1.3, -13, 13),
        wetBias: clamp(nextAdjust.wetBias + (recommendation.mix.wet_bias ?? 0) * 1.2, -0.5, 0.5),
        dryBias: clamp(nextAdjust.dryBias - (recommendation.mix.wet_bias ?? 0) * 0.7, -0.4, 0.4),
      };

      // Keep texture/noise disabled to avoid project-introduced artifacts.
    }

    modeAdjustRef.current = nextAdjust;
    modeToneRef.current = nextTone;
    modeTextureRef.current = nextTexture;
    applyCompositePreset(currentMoodRef.current || 'chill');
  }, [applyCompositePreset]);

  const applyUserEQGains = useCallback((gains = DEFAULT_USER_EQ) => {
    userEqRef.current = normalizeUserEQ(gains);
    applyCompositePreset(currentMoodRef.current || 'chill');
  }, [applyCompositePreset]);

  const setSubBassFilterEnabled = useCallback((enabled) => {
    subBassFilterRef.current = Boolean(enabled);
    applyCompositePreset(currentMoodRef.current || 'chill');
  }, [applyCompositePreset]);

  const applyEnhancementNodes = useCallback(() => {
    const fx = ensureFxGraph();
    if (!fx) return;

    const now = fx.ctx.currentTime;
    const ramp = 0.22;

    const bass = bassSettingsRef.current || DEFAULT_BASS_SETTINGS;
    const stereo = stereoSettingsRef.current || DEFAULT_STEREO_SETTINGS;
    const reverb = reverbSettingsRef.current || DEFAULT_REVERB_SETTINGS;
    const norm = normSettingsRef.current || DEFAULT_NORM_SETTINGS;

    const snapAndRampE = (param, target) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(target, now + ramp);
    };

    if (fx.bassShelf) {
      const bassFreq = clamp(Number(bass.freq) || 100, 40, 250);
      const bassBoost = clamp(Number(bass.boost) || 0, -12, 12);
      snapAndRampE(fx.bassShelf.frequency, bassFreq);
      snapAndRampE(fx.bassShelf.gain, bassBoost);
    }

    if (fx.stereoLDirectGain && fx.stereoRCrossToLGain && fx.stereoRDirectGain && fx.stereoLCrossToRGain && fx.stereoPanner) {
      const width = clamp((Number(stereo.width) || 100) / 100, 0, 2);
      const pan = clamp((Number(stereo.balance) || 0) / 100, -1, 1);
      const direct = 0.5 * (1 + width);
      const cross = 0.5 * (1 - width);

      snapAndRampE(fx.stereoLDirectGain.gain, direct);
      snapAndRampE(fx.stereoRCrossToLGain.gain, cross);
      snapAndRampE(fx.stereoRDirectGain.gain, direct);
      snapAndRampE(fx.stereoLCrossToRGain.gain, cross);
      snapAndRampE(fx.stereoPanner.pan, pan);
    }

    if (fx.reverbDryGain && fx.reverbWetGain && fx.reverbConvolver) {
      const amount = clamp((Number(reverb.amount) || 0) / 100, 0, 1);
      const decay = clamp(Number(reverb.decay) || 2.5, 0.1, 10);

      snapAndRampE(fx.reverbDryGain.gain, 1 - amount * 0.68);
      snapAndRampE(fx.reverbWetGain.gain, amount * 0.35);

      const elapsedMs = Date.now() - (fx.lastReverbUpdateTs || 0);
      // Avoid frequent random IR swaps while playing; they can sound like crackle.
      if (fx.lastReverbDecay == null || (Math.abs(decay - fx.lastReverbDecay) > 0.35 && elapsedMs > 2000)) {
        fx.lastReverbDecay = decay;
        fx.lastReverbUpdateTs = Date.now();
        // Dip the wet gain before swapping the buffer to prevent the swap click,
        // then restore after the buffer has been assigned.
        const wetP = fx.reverbWetGain.gain;
        const ctxNow = fx.ctx.currentTime;
        wetP.cancelScheduledValues(ctxNow);
        wetP.setValueAtTime(wetP.value, ctxNow);
        wetP.linearRampToValueAtTime(0.0001, ctxNow + 0.018);
        const capturedCtx = fx.ctx;
        const capturedDecay = decay;
        const capturedConvolver = fx.reverbConvolver;
        const targetWet = amount * 0.35;
        setTimeout(() => {
          capturedConvolver.buffer = buildImpulseResponse(capturedCtx, capturedDecay);
          const t = capturedCtx.currentTime;
          wetP.cancelScheduledValues(t);
          wetP.setValueAtTime(0.0001, t);
          wetP.linearRampToValueAtTime(targetWet, t + 0.06);
        }, 22);
        return; // wet gain already handled above
      }
    }

    if (fx.normCompressor && fx.normMakeupGain) {
      const normEnabled = Boolean(norm.enabled);
      const target = clamp(Number(norm.target) || -14, -24, -6);
      const targetThreshold = normEnabled ? clamp(target - 2, -24, -8) : -6;
      const targetRatio = normEnabled ? 3.2 : 1;
      const makeup = normEnabled ? clamp(Math.pow(10, ((-target - 10) / 20)), 1, 1.9) : 1;

      // Use setTargetAtTime for ALL compressor params — avoids clicks from
      // direct .value assignment and linear ramps that can cause pops.
      const tc = ramp / 3;
      fx.normCompressor.threshold.cancelScheduledValues(now);
      fx.normCompressor.threshold.setValueAtTime(fx.normCompressor.threshold.value, now);
      fx.normCompressor.threshold.setTargetAtTime(targetThreshold, now, tc);

      fx.normCompressor.ratio.cancelScheduledValues(now);
      fx.normCompressor.ratio.setValueAtTime(fx.normCompressor.ratio.value, now);
      fx.normCompressor.ratio.setTargetAtTime(targetRatio, now, tc);

      fx.normCompressor.knee.cancelScheduledValues(now);
      fx.normCompressor.knee.setValueAtTime(fx.normCompressor.knee.value, now);
      fx.normCompressor.knee.setTargetAtTime(16, now, tc);

      fx.normCompressor.attack.cancelScheduledValues(now);
      fx.normCompressor.attack.setValueAtTime(fx.normCompressor.attack.value, now);
      fx.normCompressor.attack.setTargetAtTime(0.012, now, tc);

      fx.normCompressor.release.cancelScheduledValues(now);
      fx.normCompressor.release.setValueAtTime(fx.normCompressor.release.value, now);
      fx.normCompressor.release.setTargetAtTime(normEnabled ? 0.25 : 0.2, now, tc);

      snapAndRampE(fx.normMakeupGain.gain, makeup);
    }
  }, [ensureFxGraph]);

  const setBassSettings = useCallback((settings = DEFAULT_BASS_SETTINGS) => {
    bassSettingsRef.current = {
      boost: clamp(Number(settings.boost) || 0, -12, 12),
      freq: clamp(Number(settings.freq) || 100, 40, 250),
    };
    applyEnhancementNodes();
  }, [applyEnhancementNodes]);

  const setStereoSettings = useCallback((settings = DEFAULT_STEREO_SETTINGS) => {
    stereoSettingsRef.current = {
      width: clamp(Number(settings.width) || 100, 0, 200),
      balance: clamp(Number(settings.balance) || 0, -100, 100),
    };
    applyEnhancementNodes();
  }, [applyEnhancementNodes]);

  const setReverbSettings = useCallback((settings = DEFAULT_REVERB_SETTINGS) => {
    reverbSettingsRef.current = {
      amount: clamp(Number(settings.amount) || 0, 0, 100),
      decay: clamp(Number(settings.decay) || 2.5, 0.1, 10),
    };
    applyEnhancementNodes();
  }, [applyEnhancementNodes]);

  const setNormalizationSettings = useCallback((settings = DEFAULT_NORM_SETTINGS) => {
    normSettingsRef.current = {
      enabled: Boolean(settings.enabled),
      target: clamp(Number(settings.target) || -14, -24, -6),
    };
    applyEnhancementNodes();
  }, [applyEnhancementNodes]);

  const setIntensity = useCallback((pct) => {
    intensityRef.current = clamp(Number(pct) || 100, 0, 200);
    applyCompositePreset(currentMoodRef.current || 'chill');
  }, [applyCompositePreset]);

  useEffect(() => {
    // Claim media element source early so visualizer components don't steal ownership.
    ensureFxGraph();
    applyEnhancementNodes();
  }, [ensureFxGraph, applyEnhancementNodes]);

  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = state.isMuted ? 0 : state.volume;
  }, [state.volume, state.isMuted]);

  const setPlaybackRate = useCallback((targetRate = 1) => {
    const audio = audioRef.current;
    if (!audio) return;

    const safeTarget = clamp(Number(targetRate) || 1, 0.5, 2.0);
    const fx = ensureFxGraph();

    // ── Pitch-correction strategy ─────────────────────────────────────────
    // At rates ≤ 0.78 the browser's WSOLA time-stretch algorithm produces
    // audible crackling. Disabling preservesPitch at low rates lets the pitch
    // drop naturally (like slowing a tape) which sounds far cleaner.
    // During ANY transition we also disable it temporarily to avoid artifacts
    // while the rate is in motion, then restore the right value at the end.
    const setPitch = (enabled) => {
      audio.preservesPitch      = enabled;
      audio.mozPreservesPitch   = enabled;
      audio.webkitPreservesPitch = enabled;
    };
    const pitchAtTarget = safeTarget > 0.78;

    // Disable during transition to prevent mid-ramp WSOLA glitches.
    setPitch(false);

    if (rateRafRef.current) {
      cancelAnimationFrame(rateRafRef.current);
      rateRafRef.current = null;
    }

    const start = Number.isFinite(playbackRateRef.current)
      ? playbackRateRef.current
      : (Number(audio.playbackRate) || 1);

    // Tiny jumps don't need animation.
    if (Math.abs(safeTarget - start) < 0.005) {
      audio.playbackRate = safeTarget;
      audio.defaultPlaybackRate = safeTarget;
      playbackRateRef.current = safeTarget;
      setPitch(pitchAtTarget);
      return;
    }

    const t0 = performance.now();
    const rateDelta = Math.abs(safeTarget - start);
    // Longer smoothing for larger jumps; even longer when going slow to give
    // the decoder time to adjust without producing crackle.
    const slowPenalty = safeTarget < 0.78 ? 180 : 0;
    const durationMs = 240 + rateDelta * 340 + slowPenalty;

    // Level dip during transition masks any remaining zipper artifacts.
    if (fx?.mixBus?.gain && fx?.ctx) {
      const gainParam = fx.mixBus.gain;
      const now = fx.ctx.currentTime;
      const dipAmount = clamp(rateDelta * 0.10, 0.018, 0.12);
      const dipLevel  = clamp(1 - dipAmount, 0.88, 1);
      const releaseAt = now + durationMs / 1000;

      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(gainParam.value, now);
      gainParam.linearRampToValueAtTime(dipLevel, now + 0.018);
      gainParam.linearRampToValueAtTime(1, releaseAt + 0.05);
    }

    const tick = (now) => {
      const p = clamp((now - t0) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = start + (safeTarget - start) * eased;

      audio.playbackRate = next;
      audio.defaultPlaybackRate = next;
      playbackRateRef.current = next;

      if (p < 1) {
        rateRafRef.current = requestAnimationFrame(tick);
      } else {
        rateRafRef.current = null;
        // Restore pitch correction once we've settled at the target rate.
        setPitch(pitchAtTarget);
      }
    };

    rateRafRef.current = requestAnimationFrame(tick);
  }, [ensureFxGraph]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!currentTrack) return;

    audio.src = currentTrack.url;
    audio.load();
    if (state.isPlaying) {
      audio.play().catch(() => {});
    }

    const onLoaded = () => dispatch({ type: 'SET_DURATION', payload: audio.duration });
    const onTimeUpdate = () => dispatch({ type: 'SET_TIME', payload: audio.currentTime });
    const onEnded = () => {
      if (state.repeat === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        if (state.playlist.length === 0) return;
        let next;
        if (state.shuffle) {
          next = Math.floor(Math.random() * state.playlist.length);
        } else {
          next = state.currentTrackIndex + 1;
          if (next >= state.playlist.length) {
            next = state.repeat === 'all' ? 0 : state.currentTrackIndex;
            if (state.repeat !== 'all') {
              audio.pause();
              dispatch({ type: 'SET_PLAYING', payload: false });
              return;
            }
          }
        }
        dispatch({ type: 'SET_TRACK_INDEX', payload: next });
      }
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentTrack, state.isPlaying, state.repeat, state.playlist.length, state.shuffle, state.currentTrackIndex]);

  useEffect(() => {
    return () => {
      if (rateRafRef.current) {
        cancelAnimationFrame(rateRafRef.current);
        rateRafRef.current = null;
      }
    };
  }, []);

  const play = useCallback(() => {
    ensureFxGraph();
    audioRef.current.play().catch(() => {});
    dispatch({ type: 'SET_PLAYING', payload: true });
  }, [ensureFxGraph]);

  const pause = useCallback(() => {
    audioRef.current.pause();
    dispatch({ type: 'SET_PLAYING', payload: false });
  }, []);

  const togglePlay = useCallback(() => {
    if (state.isPlaying) pause();
    else play();
  }, [state.isPlaying, play, pause]);

  const seekTo = useCallback((time) => {
    audioRef.current.currentTime = time;
    dispatch({ type: 'SET_TIME', payload: time });
  }, []);

  const nextTrack = useCallback(() => {
    if (state.playlist.length === 0) return;
    let next;
    if (state.shuffle) {
      next = Math.floor(Math.random() * state.playlist.length);
    } else {
      next = state.currentTrackIndex + 1;
      if (next >= state.playlist.length) {
        next = state.repeat === 'all' ? 0 : state.currentTrackIndex;
        if (state.repeat !== 'all') {
          pause();
          return;
        }
      }
    }
    dispatch({ type: 'SET_TRACK_INDEX', payload: next });
  }, [state.playlist.length, state.currentTrackIndex, state.shuffle, state.repeat, pause]);

  const prevTrack = useCallback(() => {
    if (state.currentTime > 3) {
      seekTo(0);
      return;
    }
    const prev = Math.max(0, state.currentTrackIndex - 1);
    dispatch({ type: 'SET_TRACK_INDEX', payload: prev });
  }, [state.currentTrackIndex, state.currentTime, seekTo]);

  const addFiles = useCallback((files) => {
    const tracks = files.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      file: file,
      url: URL.createObjectURL(file),
      artist: 'Unknown Artist',
      duration: 0,
      format: file.name.split('.').pop().toUpperCase(),
      size: file.size,
    }));
    if (state.playlist.length === 0) {
      dispatch({ type: 'SET_PLAYLIST', payload: tracks });
    } else {
      dispatch({ type: 'ADD_TRACKS', payload: tracks });
    }
  }, [state.playlist.length]);

  const value = {
    ...state,
    currentTrack,
    audioRef,
    play,
    pause,
    togglePlay,
    seekTo,
    nextTrack,
    prevTrack,
    addFiles,
    applyMoodPreset,
    applyListeningMode,
    applyUserEQGains,
    setSubBassFilterEnabled,
    setBassSettings,
    setStereoSettings,
    setReverbSettings,
    setNormalizationSettings,
    setPlaybackRate,
    setIntensity,
    getSharedAnalyserNode,
    getAnalyserNode,
    dispatch,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
