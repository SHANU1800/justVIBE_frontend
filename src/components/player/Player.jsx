import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { usePlayer } from '../../state/PlayerContext';
import { useRealtimeGenre } from '../../state/RealtimeGenreContext';
import { getModeRecommendationFromFile } from '../../services/mlApi';
import Icon from '../common/Icons';

function clampPlaybackSpeed(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

/** One-tap sound presets — warmth, reverb %, stereo %, intensity %, AI strength %, speed */
const QUICK_PROFILE_DEFAULTS = {
  studio: { profileStrength: 95, intensityPct: 100, warmthDb: 1.5, reverbAmountPct: 12, stereoWidthPct: 105, speedValue: 1 },
  night: { profileStrength: 110, intensityPct: 120, warmthDb: 3.5, reverbAmountPct: 24, stereoWidthPct: 96, speedValue: 1 },
  dream: { profileStrength: 120, intensityPct: 130, warmthDb: 2.5, reverbAmountPct: 36, stereoWidthPct: 116, speedValue: 0.75 },
  purist: { profileStrength: 75, intensityPct: 85, warmthDb: 0, reverbAmountPct: 0, stereoWidthPct: 100, speedValue: 1 },
  club: { profileStrength: 118, intensityPct: 128, warmthDb: 2.2, reverbAmountPct: 8, stereoWidthPct: 128, speedValue: 1 },
  vinyl: { profileStrength: 102, intensityPct: 108, warmthDb: 4.2, reverbAmountPct: 10, stereoWidthPct: 94, speedValue: 0.97 },
  cafe: { profileStrength: 88, intensityPct: 92, warmthDb: 2, reverbAmountPct: 14, stereoWidthPct: 102, speedValue: 1 },
  bass: { profileStrength: 112, intensityPct: 118, warmthDb: 5.5, reverbAmountPct: 12, stereoWidthPct: 86, speedValue: 1 },
  arena: { profileStrength: 94, intensityPct: 100, warmthDb: 0.5, reverbAmountPct: 48, stereoWidthPct: 124, speedValue: 1 },
  focus: { profileStrength: 85, intensityPct: 88, warmthDb: -1.2, reverbAmountPct: 6, stereoWidthPct: 98, speedValue: 1 },
};

export default function Player({
  userMood = 'chill',
  onMoodChange = () => {},
  listeningMode: controlledListeningMode,
  onListeningModeChange,
  modeHint: controlledModeHint,
  modeRequestOptions,
  onModeRequestOptionsChange,
}) {
  const {
    playlist, currentTrack, currentTrackIndex, isPlaying,
    addFiles, dispatch, togglePlay, play, pause, applyListeningMode,
    setPlaybackRate, setBassSettings, setReverbSettings, setStereoSettings,
    setIntensity,
  } = usePlayer();
  const { preprocessCurrentTrack } = useRealtimeGenre();
  const fileRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [listeningMode, setListeningMode] = useState('Normal');
  const [modeHint, setModeHint] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [speedValue, setSpeedValue] = useState(() =>
    clampPlaybackSpeed(modeRequestOptions?.target_speed ?? 1),
  );
  const [intensityPct, setIntensityPct] = useState(100);
  const [profileStrength, setProfileStrength] = useState(Math.round((Number(modeRequestOptions?.profile_strength ?? 1)) * 100));
  const [warmthDb, setWarmthDb] = useState(Number(modeRequestOptions?.bass_boost_db ?? 0));
  const [reverbAmountPct, setReverbAmountPct] = useState(Math.round((Number(modeRequestOptions?.reverb_amount ?? 0.2)) * 100));
  const [stereoWidthPct, setStereoWidthPct] = useState(Math.round((Number(modeRequestOptions?.stereo_width ?? 1)) * 100));
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemainingSec, setSleepRemainingSec] = useState(0);
  const sleepDeadlineRef = useRef(null);
  const effectiveListeningMode = controlledListeningMode ?? listeningMode;
  const effectiveModeHint = controlledModeHint ?? modeHint;

  const currentModeOptions = useMemo(() => ({
    profile_strength: Number((profileStrength / 100).toFixed(2)),
    target_speed: Number(speedValue.toFixed(2)),
    reverb_amount: Number((reverbAmountPct / 100).toFixed(2)),
    stereo_width: Number((stereoWidthPct / 100).toFixed(2)),
    bass_boost_db: Number(warmthDb.toFixed(1)),
  }), [profileStrength, speedValue, reverbAmountPct, stereoWidthPct, warmthDb]);

  const PLAYER_MODES = [
    { value: 'Normal', label: 'Normal' },
    { value: 'Enhanced', label: 'Enhanced' },
    { value: 'Lo-Fi', label: 'Lo-Fi' },
    { value: 'DJ', label: 'DJ (Untrained)' },
  ];

  const handleListeningModeChange = useCallback(async (mode) => {
    if (onListeningModeChange) {
      onListeningModeChange(mode, currentModeOptions);
      return;
    }

    setListeningMode(mode);

    // Immediate local fallback so user hears change instantly.
    applyListeningMode(mode);

    if (!currentTrack?.file || mode === 'Normal') {
      setModeHint(mode === 'Normal' ? 'Normal mode active' : '');
      return;
    }

    setModeHint('Applying model profile...');
    try {
      const result = await getModeRecommendationFromFile(currentTrack.file, mode, currentModeOptions);
      if (result?.status === 'ok') {
        applyListeningMode(mode, result);
        const source = result.source || 'fallback';
        setModeHint(`${mode} active (${source})`);
      } else {
        setModeHint(`${mode} active (fallback)`);
      }
    } catch {
      setModeHint(`${mode} active (fallback)`);
    }
  }, [onListeningModeChange, applyListeningMode, currentTrack, currentModeOptions]);

  const handleFiles = useCallback((fileList) => {
    const audioFiles = Array.from(fileList).filter(f =>
      /\.(mp3|wav|ogg|flac|m4a|aac|wma|opus|webm)$/i.test(f.name)
    );
    if (audioFiles.length > 0) addFiles(audioFiles);
  }, [addFiles]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  useEffect(() => {
    // In controlled mode, parent App owns recommendation requests.
    if (onListeningModeChange) return;
    if (!currentTrack?.file || effectiveListeningMode === 'Normal') return;

    applyListeningMode(effectiveListeningMode);

    getModeRecommendationFromFile(currentTrack.file, effectiveListeningMode, currentModeOptions)
      .then((result) => {
        if (result?.status === 'ok') {
          applyListeningMode(effectiveListeningMode, result);
        }
      })
      .catch(() => {});
  }, [currentTrack, effectiveListeningMode, applyListeningMode, currentModeOptions, onListeningModeChange]);

  useEffect(() => {
    setPlaybackRate?.(speedValue);
  }, [setPlaybackRate, speedValue]);

  useEffect(() => {
    setIntensity?.(intensityPct);
  }, [setIntensity, intensityPct]);

  useEffect(() => {
    setBassSettings?.({
      boost: warmthDb,
      freq: warmthDb >= 0 ? 92 : 122,
    });
  }, [setBassSettings, warmthDb]);

  useEffect(() => {
    setReverbSettings?.({
      amount: reverbAmountPct,
      decay: 1.6 + (reverbAmountPct / 100) * 4.2,
    });
  }, [setReverbSettings, reverbAmountPct]);

  useEffect(() => {
    setStereoSettings?.({
      width: stereoWidthPct,
      balance: 0,
    });
  }, [setStereoSettings, stereoWidthPct]);

  useEffect(() => {
    onModeRequestOptionsChange?.(currentModeOptions);
  }, [onModeRequestOptionsChange, currentModeOptions]);

  useEffect(() => {
    if (!sleepMinutes || sleepMinutes <= 0) {
      sleepDeadlineRef.current = null;
      setSleepRemainingSec(0);
      return;
    }

    const deadline = Date.now() + sleepMinutes * 60 * 1000;
    sleepDeadlineRef.current = deadline;
    setSleepRemainingSec(sleepMinutes * 60);

    const timer = setInterval(() => {
      const remainingMs = (sleepDeadlineRef.current ?? 0) - Date.now();
      if (remainingMs <= 0) {
        setSleepRemainingSec(0);
        setSleepMinutes(0);
        sleepDeadlineRef.current = null;
        pause();
        return;
      }
      setSleepRemainingSec(Math.ceil(remainingMs / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [sleepMinutes, pause]);

  const applyQuickProfile = useCallback((profile) => {
    const p = QUICK_PROFILE_DEFAULTS[profile];
    if (!p) return;
    setProfileStrength(p.profileStrength);
    setIntensityPct(p.intensityPct);
    setWarmthDb(p.warmthDb);
    setReverbAmountPct(p.reverbAmountPct);
    setStereoWidthPct(p.stereoWidthPct);
    setSpeedValue(p.speedValue);
  }, []);

  return (
    <div className="fade-in space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          <span className="inline-flex items-center gap-2" style={{
            fontFamily: 'var(--font-display)',
            background: 'var(--gradient-neon)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 16px rgba(155,114,248,0.35))',
          }}>
            <Icon name="music" className="h-8 w-8" style={{ filter: 'none', WebkitTextFillColor: 'initial' }} />
            Player
          </span>
        </h1>
        <p className="text-slate-500 text-sm">Import your music and let justVIBE enhance your listening experience</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[rgba(8,10,24,0.7)] px-3 py-2 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Mood effect</span>
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {[
              { id: 'chill', label: 'Chill' },
              { id: 'focus', label: 'Focus' },
              { id: 'hype', label: 'Hype' },
              { id: 'romantic', label: 'Romantic' },
              { id: 'melancholy', label: 'Melancholy' },
              { id: 'dreamy', label: 'Dreamy' },
            ].map(option => (
              <button
                key={option.id}
                type="button"
                className={`rounded-full border px-3 py-1.5 whitespace-nowrap text-xs font-semibold transition-all ${userMood === option.id ? 'border-violet-300/70 bg-linear-to-r from-violet-500/70 to-cyan-500/60 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]' : 'border-white/20 bg-slate-800/60 text-slate-200 hover:border-violet-300/50 hover:bg-violet-500/20'}`}
                onClick={() => onMoodChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 items-stretch">
        {/* Playlist — full width */}
        <div className="w-full rounded-2xl border border-white/[0.07] border-t-white/[0.11] bg-[rgba(8,10,24,0.8)] backdrop-blur-2xl p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset,0_20px_80px_rgba(0,0,0,0.55)] min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Icon name="clipboard" className="h-5 w-5" />
              Playlist
              {playlist.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-violet-500/70 text-white">{playlist.length} tracks</span>
              )}
            </h3>
            <button className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(155,114,248,0.4)] hover:shadow-[0_0_36px_rgba(155,114,248,0.6)] hover:brightness-110 transition-all" onClick={() => fileRef.current?.click()}>
              + Add Files
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {playlist.length === 0 ? (
            <div
              className={`rounded-2xl border border-dashed p-8 text-center cursor-pointer transition-all ${isDragging ? 'border-violet-300/60 bg-violet-500/15' : 'border-white/20 bg-slate-800/40 hover:border-violet-300/40 hover:bg-violet-500/10'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-slate-900/70">
                <Icon name="upload" className="h-6 w-6 text-slate-200" />
              </div>
              <div className="font-semibold text-slate-100">Drop audio files here</div>
              <div className="text-sm text-slate-400">or click to browse — MP3, WAV, FLAC, OGG, M4A</div>
            </div>
          ) : (
            <div className="playlist playlist-panel-scroll">
              {playlist.map((track, i) => (
                <div
                  key={track.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 mb-2 cursor-pointer transition-all ${i === currentTrackIndex ? 'border-violet-400/40 bg-violet-500/15' : 'border-white/10 bg-slate-800/30 hover:bg-white/5 hover:border-white/20'}`}
                  onClick={() => {
                    if (i === currentTrackIndex) {
                      togglePlay();
                      return;
                    }

                    pause();
                    preprocessCurrentTrack(track).catch(() => {});
                    dispatch({ type: 'SET_TRACK_INDEX', payload: i });
                    play();
                  }}
                >
                  <span className="w-6 text-center text-sm text-slate-300">
                    {i === currentTrackIndex && isPlaying ? (
                      <Icon name="play" className="h-4 w-4 mx-auto" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="h-9 w-9 rounded-lg bg-slate-700/70 grid place-items-center"><Icon name="music" className="h-4 w-4 text-slate-100" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-100">{track.name}</div>
                    <div className="text-xs text-slate-400">{track.format} • {(track.size / (1024 * 1024)).toFixed(1)} MB</div>
                  </div>
                  <button
                    className="h-7 w-7 rounded-full border border-white/15 text-slate-300 hover:text-white hover:border-rose-300/60"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'REMOVE_TRACK', payload: i });
                    }}
                    style={{ fontSize: '0.8rem', width: '28px', height: '28px' }}
                  >
                    <Icon name="close" className="h-3.5 w-3.5 mx-auto" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Additional drop zone for adding more */}
          {playlist.length > 0 && (
            <div
              className={`rounded-xl border border-dashed px-4 py-4 mt-3 text-center transition-all ${isDragging ? 'border-violet-300/60 bg-violet-500/15' : 'border-white/20 bg-slate-800/30'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <div className="text-sm text-slate-400">Drop more files here to add to playlist</div>
            </div>
          )}
        </div>

        {/* Now playing + modes + sliders — horizontal strip below playlist (stacks on small screens) */}
        <div className="w-full rounded-2xl border border-white/[0.07] border-t-white/[0.11] bg-[rgba(8,10,24,0.8)] backdrop-blur-2xl p-4 md:p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset,0_20px_80px_rgba(0,0,0,0.55)] min-h-0">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Icon name="headphones" className="h-5 w-5 text-violet-300/90" />
            <h3 className="text-lg font-semibold">Now playing & controls</h3>
          </div>

          {currentTrack ? (
            <div className="flex flex-col lg:flex-row lg:items-start gap-5 lg:gap-8">
              {/* LEFT: track + slider bars */}
              <div className="flex flex-col gap-4 min-w-0 flex-1 lg:max-w-xl lg:shrink-0">
                <div className="flex flex-row items-center gap-3">
                  <div
                    className="shrink-0 rounded-xl flex items-center justify-center h-[4.5rem] w-[4.5rem] sm:h-[5rem] sm:w-[5rem]"
                    style={{
                      background: 'var(--gradient-neon)',
                      boxShadow: isPlaying ? '0 0 28px rgba(155,114,248,0.45)' : '0 4px 16px rgba(0,0,0,0.45)',
                      transition: 'all 0.5s ease',
                      animation: isPlaying ? 'cover-pulse 3s ease-in-out infinite' : 'none',
                    }}
                  >
                    <Icon name="music" className="h-9 w-9 sm:h-10 sm:w-10 text-white" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate font-bold text-slate-100" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                      {currentTrack.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {isPlaying ? 'Playing' : 'Ready'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-slate-900/40 p-3 text-[11px] text-slate-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-12 shrink-0 text-slate-400 font-medium">Speed</span>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.01"
                        value={speedValue}
                        onChange={(e) => setSpeedValue(clampPlaybackSpeed(parseFloat(e.target.value)))}
                        className="flex-1 accent-violet-400 min-w-0"
                      />
                      <span className="w-10 shrink-0 text-right text-slate-300 tabular-nums text-[10px]">{speedValue.toFixed(2)}×</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-12 shrink-0 text-slate-400 font-medium">Intensity</span>
                      <input
                        type="range" min="0" max="150" step="1" value={intensityPct}
                        onChange={(e) => setIntensityPct(parseInt(e.target.value, 10))}
                        className="flex-1 accent-violet-400 min-w-0"
                      />
                      <span className="w-8 shrink-0 text-right text-slate-400">{intensityPct}%</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-12 shrink-0 text-slate-400 font-medium">Warmth</span>
                      <input
                        type="range" min="-6" max="6" step="0.1" value={warmthDb}
                        onChange={(e) => setWarmthDb(parseFloat(e.target.value))}
                        className="flex-1 accent-amber-400 min-w-0"
                      />
                      <span className="w-8 shrink-0 text-right text-slate-400">{warmthDb > 0 ? '+' : ''}{warmthDb.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-12 shrink-0 text-slate-400 font-medium">Space</span>
                      <input
                        type="range" min="0" max="60" step="1" value={reverbAmountPct}
                        onChange={(e) => setReverbAmountPct(parseInt(e.target.value, 10))}
                        className="flex-1 accent-cyan-400 min-w-0"
                      />
                      <span className="w-8 shrink-0 text-right text-slate-400">{reverbAmountPct}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: listening modes + presets / advanced */}
              <div className="flex flex-col gap-3 min-w-0 flex-1">
                <div className="player-mode-row player-mode-row--strip">
                  <span className="player-mode-label">Mode</span>
                  <div className="player-mode-group">
                    {PLAYER_MODES.map(mode => (
                      <button
                        key={mode.value}
                        type="button"
                        className={`player-mode-btn ${effectiveListeningMode === mode.value ? 'active' : ''}`}
                        onClick={() => handleListeningModeChange(mode.value)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                {effectiveModeHint && (
                  <div className="text-[10px] text-slate-500 leading-snug px-1">{effectiveModeHint}</div>
                )}

                <div className="rounded-xl border border-white/[0.06] bg-slate-900/25 p-3 min-w-0">
                <button
                  type="button"
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-200"
                  onClick={() => setShowAdvanced(v => !v)}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name="settings" className="h-3.5 w-3.5" />
                    More Options
                  </span>
                  <span className="text-[10px] text-slate-400">{showAdvanced ? '▲ Hide' : '▼ Show'}</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 text-[11px] text-slate-300">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Quick presets set warmth, space, stereo, intensity, and speed. Use <span className="text-slate-400">Reapply</span> to refresh ML EQ for the current listening mode.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {[
                        { id: 'studio', label: 'Studio Clean' },
                        { id: 'night', label: 'Deep Night' },
                        { id: 'dream', label: 'Dream Tape' },
                        { id: 'purist', label: 'Purist / Flat' },
                        { id: 'club', label: 'Club Push' },
                        { id: 'vinyl', label: 'Vinyl Warm' },
                        { id: 'cafe', label: 'Café Morning' },
                        { id: 'bass', label: 'Bass Tunnel' },
                        { id: 'arena', label: 'Arena Hall' },
                        { id: 'focus', label: 'Desk Focus' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left hover:bg-violet-500/20 hover:border-violet-400/25 transition-colors"
                          onClick={() => applyQuickProfile(id)}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-2 py-1.5 hover:bg-cyan-500/20 sm:col-span-3 text-center font-semibold text-cyan-100/95"
                        onClick={() => handleListeningModeChange(effectiveListeningMode)}
                      >
                        Reapply listening mode (ML)
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1"><span>Stereo Width</span><span>{stereoWidthPct}%</span></div>
                      <input type="range" min="70" max="140" step="1" value={stereoWidthPct} onChange={(e) => setStereoWidthPct(parseInt(e.target.value, 10))} className="w-full accent-fuchsia-400" />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1"><span>AI Strength</span><span>{profileStrength}%</span></div>
                      <input type="range" min="50" max="150" step="1" value={profileStrength} onChange={(e) => setProfileStrength(parseInt(e.target.value, 10))} className="w-full accent-violet-400" />
                    </div>

                    <div className="pt-1 border-t border-white/10">
                      <div className="flex items-center justify-between mb-1"><span>Sleep Timer</span><span>{sleepMinutes > 0 ? `${sleepMinutes} min` : 'Off'}</span></div>
                      <div className="flex gap-1.5">
                        {[0, 15, 30, 60].map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`flex-1 rounded-md border px-2 py-1 ${sleepMinutes === m ? 'border-violet-300/60 bg-violet-500/20 text-violet-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                            onClick={() => setSleepMinutes(m)}
                          >
                            {m === 0 ? 'Off' : `${m}m`}
                          </button>
                        ))}
                      </div>
                      {sleepRemainingSec > 0 && (
                        <div className="mt-1 text-[10px] text-slate-400">Auto-pause in {Math.ceil(sleepRemainingSec / 60)} min</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
          ) : (
            <div className="empty-state py-6">
              <div className="empty-state-icon inline-flex items-center justify-center"><Icon name="music" className="h-12 w-12" /></div>
              <div className="empty-state-title text-base">No track selected</div>
              <div className="empty-state-text text-sm">
                Add files to the playlist above to use modes and sliders
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
