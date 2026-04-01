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
        fx.reverbConvolver.buffer = buildImpulseResponse(fx.ctx, 2.5);

        fx.normCompressor.threshold.value = -6;
        fx.normCompressor.knee.value = 0;
        fx.normCompressor.ratio.value = 1;
        fx.normCompressor.attack.value = 0.003;
        fx.normCompressor.release.value = 0.1;
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
    const ramp = 0.2;

    const rawDry = clamp(preset.dry + modeAdjust.dryBias, 0.0, 1.2);
    const rawWet = clamp(preset.wet + modeAdjust.wetBias, 0.0, 1.2);
    const totalMix = rawDry + rawWet;
    const mixScale = totalMix > 1.0 ? (1.0 / totalMix) : 1.0;
    const targetDry = rawDry * mixScale;
    const targetWet = rawWet * mixScale;

    // Keep user EQ influence moderate to avoid harsh/noisy highs.
    const userEqInfluence = 0.6;
    const targetLow = clamp(preset.lowShelf.gain + modeAdjust.low + (userMix.low * userEqInfluence), -10, 10);
    const targetMid = clamp(preset.peaking.gain + modeAdjust.mid + (userMix.mid * userEqInfluence), -10, 10);
    const targetHigh = clamp(preset.highShelf.gain + modeAdjust.high + (userMix.high * userEqInfluence), -10, 10);
    const maxBoost = Math.max(0, targetLow, targetMid, targetHigh);
    const headroom = clamp(1 - maxBoost * 0.035, 0.68, 1);
    const safeDry = targetDry * headroom;
    const safeWet = targetWet * headroom;
    const targetLowFreq = clamp(preset.lowShelf.freq * (modeTone.lowFreqMul ?? 1), 60, 1200);
    const targetMidFreq = clamp(preset.peaking.freq * (modeTone.midFreqMul ?? 1), 250, 6000);
    const targetHighFreq = clamp(preset.highShelf.freq * (modeTone.highFreqMul ?? 1), 1800, 12000);
    const targetQ = clamp(preset.peaking.q * (modeTone.peakQMul ?? 1), 0.35, 2.0);
    const targetLowpass = clamp(modeTone.lowpassHz ?? 22000, 1200, 22000);
    const minHighpass = subBassFilterRef.current ? 30 : 20;
    const targetHighpass = clamp(Math.max(modeTone.highpassHz ?? 20, minHighpass), 20, 350);
    const targetDrive = clamp(modeTexture.drive ?? 0, 0, 1);
    const targetHiss = clamp(modeTexture.hiss ?? 0, 0, 0.004);
    const targetCrackle = clamp(modeTexture.crackle ?? 0, 0, 0.0025);
    const targetWow = clamp(modeTexture.wowDepth ?? 0, 0, 620);
    const targetFlutter = clamp(modeTexture.flutterDepth ?? 0, 0, 210);

    fx.dryGain.gain.cancelScheduledValues(now);
    fx.wetGain.gain.cancelScheduledValues(now);
    fx.lowShelf.frequency.cancelScheduledValues(now);
    fx.lowShelf.gain.cancelScheduledValues(now);
    fx.peaking.frequency.cancelScheduledValues(now);
    fx.peaking.Q.cancelScheduledValues(now);
    fx.peaking.gain.cancelScheduledValues(now);
    fx.highShelf.frequency.cancelScheduledValues(now);
    fx.highShelf.gain.cancelScheduledValues(now);
    if (fx.modeLowpass) fx.modeLowpass.frequency.cancelScheduledValues(now);
    if (fx.modeHighpass) fx.modeHighpass.frequency.cancelScheduledValues(now);
    if (fx.hissGain) fx.hissGain.gain.cancelScheduledValues(now);
    if (fx.crackleGain) fx.crackleGain.gain.cancelScheduledValues(now);
    if (fx.wowDepth) fx.wowDepth.gain.cancelScheduledValues(now);
    if (fx.flutterDepth) fx.flutterDepth.gain.cancelScheduledValues(now);
    if (fx.driveGain) fx.driveGain.gain.cancelScheduledValues(now);
    if (fx.postDriveGain) fx.postDriveGain.gain.cancelScheduledValues(now);

    fx.dryGain.gain.linearRampToValueAtTime(safeDry, now + ramp);
    fx.wetGain.gain.linearRampToValueAtTime(safeWet, now + ramp);

    fx.lowShelf.frequency.linearRampToValueAtTime(targetLowFreq, now + ramp);
    fx.lowShelf.gain.linearRampToValueAtTime(targetLow, now + ramp);

    fx.peaking.frequency.linearRampToValueAtTime(targetMidFreq, now + ramp);
    fx.peaking.Q.linearRampToValueAtTime(targetQ, now + ramp);
    fx.peaking.gain.linearRampToValueAtTime(targetMid, now + ramp);

    fx.highShelf.frequency.linearRampToValueAtTime(targetHighFreq, now + ramp);
    fx.highShelf.gain.linearRampToValueAtTime(targetHigh, now + ramp);

    if (fx.modeLowpass) {
      fx.modeLowpass.frequency.linearRampToValueAtTime(targetLowpass, now + ramp);
    }
    if (fx.modeHighpass) {
      fx.modeHighpass.frequency.linearRampToValueAtTime(targetHighpass, now + ramp);
    }

    if (fx.modeDrive) {
      fx.modeDrive.curve = makeDriveCurve(targetDrive);
    }
    if (fx.driveGain) {
      fx.driveGain.gain.linearRampToValueAtTime(1 + targetDrive * 1.4, now + ramp);
    }
    if (fx.postDriveGain) {
      fx.postDriveGain.gain.linearRampToValueAtTime(1 / (1 + targetDrive * 1.2), now + ramp);
    }
    if (fx.hissGain) {
      fx.hissGain.gain.linearRampToValueAtTime(targetHiss, now + ramp);
    }
    if (fx.crackleGain) {
      fx.crackleGain.gain.linearRampToValueAtTime(targetCrackle, now + ramp);
    }
    if (fx.wowDepth) {
      fx.wowDepth.gain.linearRampToValueAtTime(targetWow, now + ramp);
    }
    if (fx.flutterDepth) {
      fx.flutterDepth.gain.linearRampToValueAtTime(targetFlutter, now + ramp);
    }
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
      nextAdjust = { low: 8.2, mid: -1.8, high: 7.2, wetBias: 0.28, dryBias: -0.15 };
      nextTone = { ...DEFAULT_MODE_TONE, lowFreqMul: 1.18, midFreqMul: 1.02, highFreqMul: 1.16, peakQMul: 1.15, lowpassHz: 17000, highpassHz: 35 };
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
    const ramp = 0.12;

    const bass = bassSettingsRef.current || DEFAULT_BASS_SETTINGS;
    const stereo = stereoSettingsRef.current || DEFAULT_STEREO_SETTINGS;
    const reverb = reverbSettingsRef.current || DEFAULT_REVERB_SETTINGS;
    const norm = normSettingsRef.current || DEFAULT_NORM_SETTINGS;

    if (fx.bassShelf) {
      const bassFreq = clamp(Number(bass.freq) || 100, 40, 250);
      const bassBoost = clamp(Number(bass.boost) || 0, -12, 12);
      fx.bassShelf.frequency.cancelScheduledValues(now);
      fx.bassShelf.gain.cancelScheduledValues(now);
      fx.bassShelf.frequency.linearRampToValueAtTime(bassFreq, now + ramp);
      fx.bassShelf.gain.linearRampToValueAtTime(bassBoost, now + ramp);
    }

    if (fx.stereoLDirectGain && fx.stereoRCrossToLGain && fx.stereoRDirectGain && fx.stereoLCrossToRGain && fx.stereoPanner) {
      const width = clamp((Number(stereo.width) || 100) / 100, 0, 2);
      const pan = clamp((Number(stereo.balance) || 0) / 100, -1, 1);
      const direct = 0.5 * (1 + width);
      const cross = 0.5 * (1 - width);

      fx.stereoLDirectGain.gain.cancelScheduledValues(now);
      fx.stereoRCrossToLGain.gain.cancelScheduledValues(now);
      fx.stereoRDirectGain.gain.cancelScheduledValues(now);
      fx.stereoLCrossToRGain.gain.cancelScheduledValues(now);
      fx.stereoPanner.pan.cancelScheduledValues(now);

      fx.stereoLDirectGain.gain.linearRampToValueAtTime(direct, now + ramp);
      fx.stereoRCrossToLGain.gain.linearRampToValueAtTime(cross, now + ramp);
      fx.stereoRDirectGain.gain.linearRampToValueAtTime(direct, now + ramp);
      fx.stereoLCrossToRGain.gain.linearRampToValueAtTime(cross, now + ramp);
      fx.stereoPanner.pan.linearRampToValueAtTime(pan, now + ramp);
    }

    if (fx.reverbDryGain && fx.reverbWetGain && fx.reverbConvolver) {
      const amount = clamp((Number(reverb.amount) || 0) / 100, 0, 1);
      const decay = clamp(Number(reverb.decay) || 2.5, 0.1, 10);

      fx.reverbDryGain.gain.cancelScheduledValues(now);
      fx.reverbWetGain.gain.cancelScheduledValues(now);
      fx.reverbDryGain.gain.linearRampToValueAtTime(1 - amount * 0.85, now + ramp);
      fx.reverbWetGain.gain.linearRampToValueAtTime(amount * 0.6, now + ramp);

      if (fx.lastReverbDecay == null || Math.abs(decay - fx.lastReverbDecay) > 0.12) {
        fx.lastReverbDecay = decay;
        fx.reverbConvolver.buffer = buildImpulseResponse(fx.ctx, decay);
      }
    }

    if (fx.normCompressor && fx.normMakeupGain) {
      const normEnabled = Boolean(norm.enabled);
      const target = clamp(Number(norm.target) || -14, -24, -6);
      const targetThreshold = normEnabled ? clamp(target - 2, -24, -8) : -6;
      const targetRatio = normEnabled ? 3.2 : 1;
      const makeup = normEnabled ? clamp(Math.pow(10, ((-target - 10) / 20)), 1, 1.9) : 1;

      fx.normCompressor.threshold.cancelScheduledValues(now);
      fx.normCompressor.ratio.cancelScheduledValues(now);
      fx.normMakeupGain.gain.cancelScheduledValues(now);

      fx.normCompressor.threshold.linearRampToValueAtTime(targetThreshold, now + ramp);
      fx.normCompressor.ratio.linearRampToValueAtTime(targetRatio, now + ramp);
      fx.normMakeupGain.gain.linearRampToValueAtTime(makeup, now + ramp);

      fx.normCompressor.knee.value = normEnabled ? 14 : 0;
      fx.normCompressor.attack.value = 0.004;
      fx.normCompressor.release.value = normEnabled ? 0.2 : 0.1;
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

    // Keep pitch correction enabled so slow/fast playback has fewer metallic artifacts.
    audio.preservesPitch = true;
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;

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
      return;
    }

    const t0 = performance.now();
    // Longer smoothing for larger jumps to reduce crackle/zipper artifacts.
    const durationMs = 180 + Math.abs(safeTarget - start) * 260;
    const rateDelta = Math.abs(safeTarget - start);

    // Apply a subtle, temporary level dip around rate transitions to suppress zipper noise.
    if (fx?.mixBus?.gain && fx?.ctx) {
      const gainParam = fx.mixBus.gain;
      const now = fx.ctx.currentTime;
      const dipAmount = clamp(rateDelta * 0.08, 0.015, 0.08);
      const dipLevel = clamp(1 - dipAmount, 0.9, 1);
      const releaseAt = now + durationMs / 1000;

      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(gainParam.value, now);
      gainParam.linearRampToValueAtTime(dipLevel, now + 0.016);
      gainParam.linearRampToValueAtTime(1, releaseAt + 0.04);
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
