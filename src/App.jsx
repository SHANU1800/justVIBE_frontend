import { useState, useEffect, useCallback, useRef } from 'react';
import { PlayerProvider, usePlayer } from './state/PlayerContext';
import { AnalysisProvider, useAnalysis } from './state/AnalysisContext';
import { RealtimeGenreProvider, useRealtimeGenre } from './state/RealtimeGenreContext';
import Player from './components/player/Player';
import Analysis from './components/analysis/Analysis';
import Equalizer from './components/equalizer/Equalizer';
import AudioVisualizer from './components/visualizer/AudioVisualizer';
import ImmersiveVisualsPage from './components/visualizer/ImmersiveVisualsPage';
import Icon from './components/common/Icons';
import { getModeRecommendationFromFile } from './services/mlApi';

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const NAV_ITEMS = [
  { id: 'player', icon: 'music', label: 'Player' },
  { id: 'visuals', icon: 'visuals', label: 'Visuals' },
  { id: 'analysis', icon: 'analysis', label: 'Analysis' },
];

const SPEEDS = ['0.5×', '0.75×', '1×', '1.25×', '1.5×', '2×'];
const SPEED_VALUES = { '0.5×': 0.5, '0.75×': 0.75, '1×': 1, '1.25×': 1.25, '1.5×': 1.5, '2×': 2 };
const MOOD_OPTIONS = [
  { id: 'chill', label: 'Chill' },
  { id: 'focus', label: 'Focus' },
  { id: 'hype', label: 'Hype' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'melancholy', label: 'Melancholy' },
  { id: 'dreamy', label: 'Dreamy' },
];
const PLAYER_MODES = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Enhanced', label: 'Enhanced' },
  { value: 'Lo-Fi', label: 'Lo-Fi' },
  { value: 'DJ', label: 'DJ (Untrained)' },
];

function AppContent() {
  const [activePage, setActivePage] = useState('player');
  const [speed, setSpeed] = useState('1×');
  const [userMood, setUserMood] = useState('chill');
  const [loopA, setLoopA] = useState(null);
  const [loopB, setLoopB] = useState(null);
  const [listeningMode, setListeningMode] = useState('Normal');
  const [modeHint, setModeHint] = useState('');
  const [topGraphMode, setTopGraphMode] = useState('frequency');
  const lastBackendCheckRef = useRef(0);

  const { backendStatus, backendIssue, modelDiagnostics, checkBackend } = useAnalysis();
  const {
    currentTrack, isPlaying, currentTime, duration, volume, isMuted,
    shuffle, repeat, togglePlay, nextTrack, prevTrack, seekTo, dispatch,
    playlist, applyMoodPreset, applyListeningMode, setPlaybackRate,
  } = usePlayer();
  const {
    currentGenre, isLoadingTimeline, genreTimeline, transitionDuration, setTransitionDuration,
    autoEQEnabled, setAutoEQEnabled,
    preprocessCurrentTrack, backendError, clearBackendError,
  } = useRealtimeGenre();

  const handleListeningModeChange = useCallback(async (mode) => {
    setListeningMode(mode);
    applyListeningMode(mode);

    if (!currentTrack?.file || mode === 'Normal') {
      setModeHint(mode === 'Normal' ? 'Normal mode active' : '');
      return;
    }

    if (mode === 'Enhanced') {
      preprocessCurrentTrack(currentTrack);
    }

    setModeHint('Applying model profile...');
    try {
      const result = await getModeRecommendationFromFile(currentTrack.file, mode);
      if (result?.status === 'ok') {
        applyListeningMode(mode, result);
        setModeHint(`${mode} active (${result.source || 'fallback'})`);
      } else {
        setModeHint(`${mode} active (fallback)`);
      }
    } catch (error) {
      const reason = error?.message ? ` — ${error.message}` : '';
      setModeHint(`${mode} active (fallback${reason})`);
    }
  }, [applyListeningMode, currentTrack, preprocessCurrentTrack]);

  useEffect(() => {
    if (!currentTrack?.file || listeningMode === 'Normal') return;

    applyListeningMode(listeningMode);
    if (listeningMode === 'Enhanced') {
      preprocessCurrentTrack(currentTrack);
    }

    getModeRecommendationFromFile(currentTrack.file, listeningMode)
      .then((result) => {
        if (result?.status === 'ok') {
          applyListeningMode(listeningMode, result);
        }
      })
      .catch((error) => {
        const reason = error?.message ? ` — ${error.message}` : '';
        setModeHint(`${listeningMode} active (fallback${reason})`);
      });
  }, [currentTrack, listeningMode, applyListeningMode, preprocessCurrentTrack]);

  // A/B loop monitoring
  const loopRef = useRef({ A: null, B: null });

  useEffect(() => {
    loopRef.current = { A: loopA, B: loopB };
  }, [loopA, loopB]);

  // Handle A/B loop during playback
  useEffect(() => {
    if (!isPlaying) return;
    const { A, B } = loopRef.current;
    if (A !== null && B !== null && currentTime >= B) {
      seekTo(A);
    }
  }, [currentTime, isPlaying, seekTo]);

  // Apply playback speed
  useEffect(() => {
    setPlaybackRate?.(SPEED_VALUES[speed] ?? 1);
  }, [speed, setPlaybackRate]);

  const runBackendCheck = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastBackendCheckRef.current < 30000) return;
    lastBackendCheckRef.current = now;
    checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    runBackendCheck(true);
    const interval = setInterval(() => runBackendCheck(), 120000);
    return () => clearInterval(interval);
  }, [runBackendCheck]);

  useEffect(() => {
    const onFocus = () => runBackendCheck();
    const onVisibility = () => {
      if (!document.hidden) runBackendCheck();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [runBackendCheck]);

  useEffect(() => {
    applyMoodPreset(userMood);
  }, [userMood, applyMoodPreset]);

  const setMarkerA = useCallback(() => {
    setLoopA(currentTime);
    if (loopB !== null && currentTime >= loopB) setLoopB(null);
  }, [currentTime, loopB]);

  const setMarkerB = useCallback(() => {
    if (loopA === null || currentTime > loopA) {
      setLoopB(currentTime);
    }
  }, [currentTime, loopA]);

  const clearLoop = useCallback(() => {
    setLoopA(null);
    setLoopB(null);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      togglePlay();
      return;
    }

    if (currentTrack && genreTimeline.length === 0) {
      preprocessCurrentTrack(currentTrack);
    }

    togglePlay();
  }, [isPlaying, togglePlay, currentTrack, genreTimeline.length, preprocessCurrentTrack]);

  const renderPage = () => {
    switch (activePage) {
      case 'player':
        return (
          <div className="space-y-6">
            <Player
              userMood={userMood}
              onMoodChange={setUserMood}
              listeningMode={listeningMode}
              onListeningModeChange={handleListeningModeChange}
              modeHint={modeHint}
            />
            <Equalizer
              listeningMode={listeningMode}
              onListeningModeChange={handleListeningModeChange}
            />
          </div>
        );
      case 'visuals':     return <ImmersiveVisualsPage userMood={userMood} />;
      case 'analysis':    return <Analysis />;
      default:            return <Player />;
    }
  };

  const isVisualsPage = activePage === 'visuals';

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const loopAPct = loopA !== null && duration > 0 ? (loopA / duration) * 100 : null;
  const loopBPct = loopB !== null && duration > 0 ? (loopB / duration) * 100 : null;

  const activeNavItem = NAV_ITEMS.find(item => item.id === activePage);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col">
      <main className={`flex-1 flex flex-col overflow-hidden relative mood-${userMood}`}>
        <div className="h-12 border-b border-white/10 bg-slate-900/55 backdrop-blur-xl px-3 md:px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-linear-to-br from-violet-500 to-cyan-400 grid place-items-center shadow-[0_0_14px_rgba(139,92,246,0.35)]">
              <Icon name="headphones" className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight truncate">justVIBE</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">AI Music Companion</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden sm:inline">Page</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-800/65 px-2 py-0.5 text-slate-200">
              <Icon name={activeNavItem?.icon || 'music'} className="h-3.5 w-3.5" />
              {activeNavItem?.label}
            </span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${backendStatus === 'ok' ? 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]' : backendStatus === 'degraded' ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.7)]' : 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.7)]'}`}
              title={backendStatus === 'ok' ? 'Backend Connected' : backendStatus === 'degraded' ? 'Backend Connected, ML Models Missing' : backendStatus === 'offline' ? 'Backend Offline' : 'Checking backend'}
            />
          </div>
        </div>

        {(backendStatus === 'offline' || backendStatus === 'degraded' || backendError) && (
          <div className={`mx-3 md:mx-4 mt-3 rounded-xl px-3 py-2 text-sm flex items-start justify-between gap-3 ${backendStatus === 'degraded' ? 'border border-amber-400/45 bg-amber-500/10 text-amber-100' : 'border border-rose-400/45 bg-rose-500/10 text-rose-100'}`}>
            <div className="inline-flex items-start gap-2">
              <Icon name="warning" className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-semibold">{backendStatus === 'degraded' ? 'Backend connected, but ML models are unavailable' : 'ML server appears offline'}</div>
                <div className={`text-xs md:text-sm ${backendStatus === 'degraded' ? 'text-amber-200/90' : 'text-rose-200/90'}`}>
                  {backendError || backendIssue || 'Cannot reach backend right now. Check Render service status and VITE_API_BASE configuration.'}
                </div>
                {backendStatus === 'degraded' && modelDiagnostics?.weightsDir && (
                  <div className="text-[11px] mt-1 text-amber-200/80 break-all">
                    weights_dir: {modelDiagnostics.weightsDir}
                  </div>
                )}
                {backendStatus === 'degraded' && Array.isArray(modelDiagnostics?.missingFiles) && modelDiagnostics.missingFiles.length > 0 && (
                  <div className="text-[11px] mt-1 text-amber-200/80 break-all">
                    missing: {modelDiagnostics.missingFiles.slice(0, 3).join(' • ')}{modelDiagnostics.missingFiles.length > 3 ? ' • ...' : ''}
                  </div>
                )}
              </div>
            </div>
            {backendError && (
              <button
                type="button"
                className="text-xs rounded-md border border-rose-300/40 px-2 py-1 hover:bg-rose-500/20"
                onClick={clearBackendError}
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {activePage === 'player' && (
          <>
            {/* ── Spectrum Visualizer ─────────────────────────── */}
            <div className="border-b border-white/10 bg-linear-to-r from-violet-500/10 via-fuchsia-500/5 to-cyan-500/10 p-2 md:p-3">
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="text-[11px] uppercase tracking-widest text-slate-300">Original vs Current</div>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'frequency', label: 'Freq' },
                    { id: 'bars', label: 'Bars' },
                    { id: 'waveform', label: 'Wave' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      className={`h-7 px-2 rounded-md border text-[10px] font-semibold transition-colors ${topGraphMode === m.id ? 'border-cyan-300/70 text-cyan-100 bg-cyan-500/25' : 'border-white/20 text-slate-300 bg-slate-800/60 hover:border-white/35'}`}
                      onClick={() => setTopGraphMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-cyan-400/30 overflow-hidden shadow-[0_0_14px_rgba(6,182,212,0.16)]">
                <AudioVisualizer
                  height={96}
                  showControls={false}
                  userMood={userMood}
                  waveformOnly={false}
                  analyserType="processed"
                  graphMode={topGraphMode}
                  compareOverlay={true}
                  compareAnalyserType="original"
                  cleanFrequencyOnly={false}
                  minimal={true}
                  tintKey="__theme__"
                  showFrequencyGuides={false}
                />
              </div>
            </div>
          </>
        )}

        {/* ── Page Content ────────────────────────────────── */}
        <div className={`${isVisualsPage ? 'page-container-visuals-only' : 'page-container'} ${!isVisualsPage ? 'px-4 md:px-8 py-4 md:py-6' : ''}`}>
          {renderPage()}
        </div>

        {/* ── Player Bar ──────────────────────────────────── */}
        {!isVisualsPage && (
          <div className={`${isPlaying ? 'playing' : ''} min-h-24 h-auto border-t border-white/10 bg-slate-900/75 backdrop-blur-xl flex flex-wrap xl:flex-nowrap items-center gap-3 px-3 md:px-5 py-2`}>

          {/* Track Info */}
          <div className="flex items-center gap-3 min-w-0 w-full xl:w-64 2xl:w-72">
            <div className="relative h-11 w-11 shrink-0 rounded-xl bg-linear-to-br from-violet-500 to-cyan-400 grid place-items-center shadow-[0_0_20px_rgba(139,92,246,0.35)]">
              <Icon name="music" className="relative z-10 h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">
                {currentTrack ? currentTrack.name : 'No Track'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {currentGenre
                  ? <span className="inline-block px-2 py-0.5 rounded-full bg-violet-500/70 text-white text-[11px] capitalize">{currentGenre}</span>
                  : currentTrack ? currentTrack.artist : 'Import music to start'}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="order-3 xl:order-2 basis-full xl:basis-auto flex-1 min-w-0">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              {/* A/B Loop markers */}
              <button
                className={`h-7 px-2 rounded-md border text-xs font-bold transition-colors ${loopA !== null ? 'border-amber-300/70 text-amber-200 bg-amber-500/20' : 'border-white/20 text-slate-300 bg-slate-800/70 hover:border-white/35'}`}
                title="Set loop start (A)"
                onClick={setMarkerA}
              >A</button>
              <button
                className={`h-7 px-2 rounded-md border text-xs font-bold transition-colors ${loopB !== null ? 'border-cyan-300/70 text-cyan-200 bg-cyan-500/20' : 'border-white/20 text-slate-300 bg-slate-800/70 hover:border-white/35'}`}
                title="Set loop end (B)"
                onClick={setMarkerB}
                disabled={loopA === null}
              >B</button>
              <button
                className="h-7 px-2 rounded-md border border-white/20 text-slate-300 bg-slate-800/70 hover:border-white/35 text-xs font-bold"
                title="Clear loop"
                onClick={clearLoop}
                disabled={loopA === null && loopB === null}
              ><Icon name="close" className="h-3.5 w-3.5" /></button>

              <button
                className={`h-8 w-8 rounded-full border grid place-items-center transition-colors ${shuffle ? 'border-violet-300/70 text-violet-200 bg-violet-500/20' : 'border-white/20 text-slate-300 bg-slate-800/70 hover:border-white/35'}`}
                data-tooltip={`Shuffle: ${shuffle ? 'On' : 'Off'}`}
                onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })}
              ><Icon name="shuffle" className="h-4 w-4" /></button>
              <button className="h-8 w-8 rounded-full border border-white/20 text-slate-200 bg-slate-800/70 hover:border-white/35 grid place-items-center" onClick={prevTrack}><Icon name="prev" className="h-4 w-4" /></button>
              <button
                className="h-10 w-10 rounded-full border border-violet-300/60 bg-linear-to-r from-violet-500/80 to-cyan-500/70 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)] hover:brightness-110"
                onClick={handlePlayPause}
                disabled={Boolean(currentTrack) && isLoadingTimeline && !isPlaying}
                title={Boolean(currentTrack) && isLoadingTimeline && !isPlaying ? 'Analyzing track before playback...' : ''}
              >
                {isPlaying ? <Icon name="pause" className="h-4 w-4 mx-auto" /> : <Icon name="play" className="h-4 w-4 mx-auto" />}
              </button>
              <button className="h-8 w-8 rounded-full border border-white/20 text-slate-200 bg-slate-800/70 hover:border-white/35 grid place-items-center" onClick={nextTrack}><Icon name="next" className="h-4 w-4" /></button>
              <button
                className={`h-8 w-8 rounded-full border grid place-items-center transition-colors ${repeat !== 'none' ? 'border-violet-300/70 text-violet-200 bg-violet-500/20' : 'border-white/20 text-slate-300 bg-slate-800/70 hover:border-white/35'}`}
                data-tooltip={`Repeat: ${repeat}`}
                onClick={() => dispatch({ type: 'CYCLE_REPEAT' })}
              >
                {repeat === 'one' ? <Icon name="repeat-one" className="h-4 w-4" /> : <Icon name="repeat" className="h-4 w-4" />}
              </button>
            </div>

            {/* Progress bar with A/B markers */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 tabular-nums w-9 text-right">{formatTime(currentTime)}</span>
              <div
                className="relative h-2 flex-1 rounded-full bg-slate-700/70 cursor-pointer overflow-hidden"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  seekTo(pct * duration);
                }}
              >
                <div className="h-full rounded-full bg-linear-to-r from-violet-400 to-cyan-400" style={{ width: `${progressPct}%` }} />
                {loopAPct !== null && (
                  <div className="progress-marker marker-a" style={{ left: `${loopAPct}%` }} title="Loop A" />
                )}
                {loopBPct !== null && (
                  <div className="progress-marker marker-b" style={{ left: `${loopBPct}%` }} title="Loop B" />
                )}
                {loopAPct !== null && loopBPct !== null && (
                  <div
                    className="progress-loop-region"
                    style={{ left: `${loopAPct}%`, width: `${loopBPct - loopAPct}%` }}
                  />
                )}
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums w-9">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Extra Controls: Volume, Speed, Transition */}
          <div className="order-2 xl:order-3 flex items-center justify-start xl:justify-end gap-2 md:gap-3 shrink-0 w-full xl:w-auto flex-wrap">
            {/* Volume */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                className="h-7 w-7 rounded-full border border-white/20 text-slate-200 bg-slate-800/70 hover:border-white/35 text-xs"
                onClick={() => dispatch({ type: 'TOGGLE_MUTE' })}
              >
                {isMuted || volume === 0 ? <Icon name="volume-mute" className="h-3.5 w-3.5 mx-auto" /> : volume < 0.5 ? <Icon name="volume-low" className="h-3.5 w-3.5 mx-auto" /> : <Icon name="volume-high" className="h-3.5 w-3.5 mx-auto" />}
              </button>
              <input
                type="range" min="0" max="1.5" step="0.01"
                value={isMuted ? 0 : volume}
                onChange={e => dispatch({ type: 'SET_VOLUME', payload: parseFloat(e.target.value) })}
                className="w-16 md:w-20 accent-violet-400"
              />
              <span className="hidden sm:inline text-[11px] text-slate-400 tabular-nums w-9">
                {Math.round((isMuted ? 0 : volume) * 100)}%
              </span>
            </div>

            {/* Speed */}
            <div className="hidden lg:flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Speed</span>
              <select
                className="h-7 rounded-md border border-white/20 bg-slate-800/70 px-2 text-xs text-slate-200"
                value={speed}
                onChange={e => setSpeed(e.target.value)}
              >
                {SPEEDS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Modes */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Mode</span>
              <select
                className="sm:hidden h-7 max-w-34 rounded-md border border-white/20 bg-slate-800/70 px-2 text-[11px] text-slate-200"
                value={listeningMode}
                onChange={e => handleListeningModeChange(e.target.value)}
              >
                {PLAYER_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
              <div className="hidden sm:flex items-center gap-1 overflow-x-auto max-w-[58vw] xl:max-w-none pb-1">
                {PLAYER_MODES.map(mode => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`h-7 px-2 rounded-md border text-[10px] font-semibold whitespace-nowrap transition-colors ${listeningMode === mode.value ? 'border-violet-300/70 text-violet-100 bg-violet-500/30' : 'border-white/20 text-slate-300 bg-slate-800/70 hover:border-white/35'}`}
                    onClick={() => handleListeningModeChange(mode.value)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Transition duration */}
            <div className="hidden md:flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Transition</span>
              <input
                type="range" min="0" max="10" step="0.5"
                value={transitionDuration}
                onChange={e => setTransitionDuration(parseFloat(e.target.value))}
                className="w-16 accent-cyan-400"
              />
              <span className="text-[11px] text-slate-400 tabular-nums w-8">
                {transitionDuration}s
              </span>
            </div>

            {/* Auto EQ (always visible on player bar) */}
            <div className="flex items-center gap-2 xl:pl-1">
              <button
                type="button"
                className={`sm:hidden h-9 w-9 rounded-xl border grid place-items-center transition-all ${autoEQEnabled ? 'border-emerald-300/80 text-emerald-50 bg-linear-to-r from-emerald-500/45 to-cyan-500/35 shadow-[0_0_18px_rgba(16,185,129,0.35)]' : 'border-white/25 text-slate-200 bg-slate-800/80 hover:border-white/45 hover:bg-slate-700/80'}`}
                onClick={() => setAutoEQEnabled(!autoEQEnabled)}
                title={autoEQEnabled ? 'Auto EQ Live' : 'Auto EQ Off'}
                aria-label={autoEQEnabled ? 'Disable Auto EQ' : 'Enable Auto EQ'}
              >
                <Icon name="brain" className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={`hidden sm:inline-flex h-9 md:h-10 px-3 md:px-4 rounded-xl border text-[11px] md:text-xs font-extrabold tracking-[0.08em] transition-all shadow-[0_0_0_rgba(0,0,0,0)] whitespace-nowrap ${autoEQEnabled ? 'border-emerald-300/80 text-emerald-50 bg-linear-to-r from-emerald-500/45 to-cyan-500/35 shadow-[0_0_22px_rgba(16,185,129,0.42)] hover:brightness-110' : 'border-white/25 text-slate-200 bg-slate-800/80 hover:border-white/45 hover:bg-slate-700/80'}`}
                onClick={() => setAutoEQEnabled(!autoEQEnabled)}
                title={autoEQEnabled ? 'Auto EQ is enabled and continuously optimizing EQ, bass, stereo, reverb and normalization' : 'Auto EQ is disabled'}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon name="brain" className="h-4 w-4" />
                  AUTO EQ {autoEQEnabled ? 'LIVE' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
          </div>
        )}
      </main>

      <nav className="h-16 border-t border-white/10 bg-slate-900/90 backdrop-blur-xl">
        <div
          className="h-full grid gap-1 px-2 md:px-4"
          style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}
        >
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`relative h-full rounded-xl flex flex-col items-center justify-center gap-1 border transition-all duration-300 ${activePage === item.id ? 'border-violet-400/40 bg-violet-500/15 text-white shadow-[0_0_18px_rgba(139,92,246,0.2)]' : 'border-transparent text-slate-300 hover:bg-white/5 hover:border-white/10 hover:text-slate-100'}`}
              onClick={() => setActivePage(item.id)}
            >
              <Icon name={item.icon} className="h-4.5 w-4.5" />
              <span className="text-[11px] font-medium leading-none">{item.label}</span>
              {item.id === 'player' && playlist.length > 0 && (
                <span className="absolute -mt-8.5 ml-8.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/80 text-white">{playlist.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <PlayerProvider>
      <AnalysisProvider>
        <RealtimeGenreProvider>
          <AppContent />
        </RealtimeGenreProvider>
      </AnalysisProvider>
    </PlayerProvider>
  );
}
