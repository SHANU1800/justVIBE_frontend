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
    <div className="jv-bg min-h-screen w-full text-slate-100 flex flex-col">
      <main className={`app-content flex-1 flex flex-col overflow-hidden relative mood-${userMood}`}>
        <div className="jv-topbar h-12 px-3 md:px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 grid place-items-center shadow-[0_0_20px_rgba(155,114,248,0.5)]">
              <Icon name="headphones" className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>justVIBE</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">AI Music Companion</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden sm:inline">Page</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-800/65 px-2 py-0.5 text-slate-200">
              <Icon name={activeNavItem?.icon || 'music'} className="h-3.5 w-3.5" />
              {activeNavItem?.label}
            </span>
            <span
              className={`h-2.5 w-2.5 rounded-full transition-all ${backendStatus === 'ok'
                ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]'
                : backendStatus === 'degraded'
                  ? 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.8)]'
                  : 'bg-rose-500 shadow-[0_0_14px_rgba(248,113,113,0.8)]'}`}
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
          <div className="relative border-b border-white/[0.06] shrink-0">
            {/* Mode toggle — floating overlay top-right */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              {[
                { id: 'frequency', label: 'Freq' },
                { id: 'bars',      label: 'Bars' },
                { id: 'waveform',  label: 'Wave' },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`h-6 px-2.5 rounded text-[9px] font-bold tracking-wide transition-all backdrop-blur-sm border ${
                    topGraphMode === m.id
                      ? 'bg-violet-500/55 text-violet-100 border-violet-400/50 shadow-[0_0_10px_rgba(155,114,248,0.4)]'
                      : 'bg-black/40 text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/20'
                  }`}
                  onClick={() => setTopGraphMode(m.id)}
                >{m.label}</button>
              ))}
            </div>
            <AudioVisualizer
              height={112}
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
        )}

        {/* ── Page Content ────────────────────────────────── */}
        <div className={`${isVisualsPage ? 'page-container-visuals-only' : 'page-container'} ${!isVisualsPage ? 'px-4 md:px-8 py-4 md:py-6' : ''}`}>
          {renderPage()}
        </div>

        {/* ── Player Bar ──────────────────────────────────── */}
        {!isVisualsPage && (
          <div className={`jv-player-bar ${isPlaying ? 'playing' : ''} h-20 flex items-center gap-4 px-3 md:px-5 shrink-0`}>

            {/* ── Left: Track info ────────────────────── */}
            <div className="flex items-center gap-3 min-w-0 w-40 sm:w-52 md:w-60 shrink-0">
              <div className={`relative h-10 w-10 shrink-0 rounded-xl overflow-hidden ${isPlaying ? 'shadow-[0_0_20px_rgba(155,114,248,0.55)]' : ''} transition-all duration-500`}>
                <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-cyan-500 flex items-center justify-center">
                  <Icon name="music" className="h-4.5 w-4.5 text-white" />
                </div>
                {isPlaying && <div className="absolute inset-0 rounded-xl ring-2 ring-violet-400/40 animate-pulse" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-slate-100 leading-tight">
                  {currentTrack ? currentTrack.name : 'No Track'}
                </div>
                <div className="mt-0.5">
                  {currentGenre
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/50 text-violet-200 font-medium capitalize border border-violet-400/30">{currentGenre}</span>
                    : <span className="text-[11px] text-slate-600">{currentTrack ? '' : 'Drop audio to begin'}</span>
                  }
                </div>
              </div>
            </div>

            {/* ── Center: Transport + Progress ────────── */}
            <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
              {/* Transport row */}
              <div className="flex items-center gap-1 md:gap-1.5">
                {/* A/B loop — compact, only show when needed */}
                <div className="flex items-center gap-0.5 mr-0.5 md:mr-1">
                  <button
                    className={`h-6 w-6 rounded text-[10px] font-bold transition-all border ${loopA !== null ? 'border-amber-400/60 text-amber-200 bg-amber-500/20' : 'border-white/12 text-slate-600 hover:text-slate-400 hover:border-white/20'}`}
                    title="Set loop A" onClick={setMarkerA}
                  >A</button>
                  <button
                    className={`h-6 w-6 rounded text-[10px] font-bold transition-all border ${loopB !== null ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/20' : 'border-white/12 text-slate-600 hover:text-slate-400 hover:border-white/20'}`}
                    title="Set loop B" onClick={setMarkerB} disabled={loopA === null}
                  >B</button>
                  {(loopA !== null || loopB !== null) && (
                    <button className="h-6 w-6 rounded border border-white/12 text-slate-500 hover:text-rose-300 transition-colors" onClick={clearLoop}>
                      <Icon name="close" className="h-3 w-3 mx-auto" />
                    </button>
                  )}
                </div>

                <button
                  className={`h-7 w-7 rounded-full border grid place-items-center transition-all ${shuffle ? 'border-violet-400/55 text-violet-300 bg-violet-500/15' : 'border-white/12 text-slate-500 hover:text-slate-300 hover:border-white/25'}`}
                  onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })}
                ><Icon name="shuffle" className="h-3.5 w-3.5" /></button>

                <button
                  className="h-8 w-8 rounded-full border border-white/12 text-slate-400 hover:text-white hover:border-white/25 grid place-items-center transition-all"
                  onClick={prevTrack}
                ><Icon name="prev" className="h-4 w-4" /></button>

                <button
                  className="h-11 w-11 rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-white grid place-items-center shadow-[0_0_28px_rgba(155,114,248,0.55)] hover:shadow-[0_0_42px_rgba(155,114,248,0.75)] hover:scale-105 active:scale-95 transition-all"
                  onClick={handlePlayPause}
                  disabled={Boolean(currentTrack) && isLoadingTimeline && !isPlaying}
                  title={Boolean(currentTrack) && isLoadingTimeline && !isPlaying ? 'Analyzing track…' : ''}
                >
                  {isPlaying ? <Icon name="pause" className="h-4.5 w-4.5" /> : <Icon name="play" className="h-4.5 w-4.5" />}
                </button>

                <button
                  className="h-8 w-8 rounded-full border border-white/12 text-slate-400 hover:text-white hover:border-white/25 grid place-items-center transition-all"
                  onClick={nextTrack}
                ><Icon name="next" className="h-4 w-4" /></button>

                <button
                  className={`h-7 w-7 rounded-full border grid place-items-center transition-all ${repeat !== 'none' ? 'border-violet-400/55 text-violet-300 bg-violet-500/15' : 'border-white/12 text-slate-500 hover:text-slate-300 hover:border-white/25'}`}
                  onClick={() => dispatch({ type: 'CYCLE_REPEAT' })}
                >
                  {repeat === 'one' ? <Icon name="repeat-one" className="h-3.5 w-3.5" /> : <Icon name="repeat" className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Progress bar row */}
              <div className="flex items-center gap-2 w-full max-w-xl">
                <span className="text-[10px] text-slate-500 tabular-nums w-8 text-right" style={{ fontFamily: 'var(--font-mono)' }}>{formatTime(currentTime)}</span>
                <div
                  className="relative h-1.5 flex-1 rounded-full bg-white/[0.07] cursor-pointer overflow-hidden group hover:h-2 transition-all"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    seekTo((e.clientX - rect.left) / rect.width * duration);
                  }}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                    style={{ width: `${progressPct}%`, boxShadow: '0 0 10px rgba(155,114,248,0.6)' }}
                  />
                  {loopAPct !== null && <div className="progress-marker marker-a" style={{ left: `${loopAPct}%` }} />}
                  {loopBPct !== null && <div className="progress-marker marker-b" style={{ left: `${loopBPct}%` }} />}
                  {loopAPct !== null && loopBPct !== null && (
                    <div className="progress-loop-region" style={{ left: `${loopAPct}%`, width: `${loopBPct - loopAPct}%` }} />
                  )}
                </div>
                <span className="text-[10px] text-slate-500 tabular-nums w-8" style={{ fontFamily: 'var(--font-mono)' }}>{formatTime(duration)}</span>
              </div>
            </div>

            {/* ── Right: Volume + Auto EQ ──────────────── */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Volume */}
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  className="h-7 w-7 rounded-full border border-white/12 text-slate-400 hover:text-white grid place-items-center transition-colors"
                  onClick={() => dispatch({ type: 'TOGGLE_MUTE' })}
                >
                  {isMuted || volume === 0
                    ? <Icon name="volume-mute" className="h-3.5 w-3.5 mx-auto" />
                    : volume < 0.5
                      ? <Icon name="volume-low" className="h-3.5 w-3.5 mx-auto" />
                      : <Icon name="volume-high" className="h-3.5 w-3.5 mx-auto" />
                  }
                </button>
                <input
                  type="range" min="0" max="1.5" step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={e => dispatch({ type: 'SET_VOLUME', payload: parseFloat(e.target.value) })}
                  className="w-16 md:w-20 accent-violet-400"
                />
              </div>

              {/* Auto EQ pill */}
              <button
                type="button"
                className={`h-9 px-3 md:px-3.5 rounded-xl border text-[11px] font-bold tracking-wide transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  autoEQEnabled
                    ? 'border-emerald-400/55 text-emerald-200 bg-emerald-500/18 shadow-[0_0_18px_rgba(52,211,153,0.3)] hover:shadow-[0_0_28px_rgba(52,211,153,0.45)]'
                    : 'border-white/15 text-slate-500 hover:text-slate-300 hover:border-white/25'
                }`}
                onClick={() => setAutoEQEnabled(!autoEQEnabled)}
                title={autoEQEnabled ? 'Auto EQ active — continuously optimising EQ, bass, stereo and reverb' : 'Auto EQ off'}
              >
                <Icon name="brain" className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden md:inline">EQ {autoEQEnabled ? 'LIVE' : 'OFF'}</span>
              </button>
            </div>

          </div>
        )}
      </main>

      <nav className="jv-nav h-16">
        <div
          className="h-full grid gap-1 px-2 md:px-4"
          style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}
        >
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`relative h-full rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition-all duration-300 ${activePage === item.id
                ? 'border-violet-400/35 bg-violet-500/12 text-white shadow-[0_0_22px_rgba(155,114,248,0.22),inset_0_1px_0_rgba(255,255,255,0.07)]'
                : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:border-white/10 hover:text-slate-200'}`}
              onClick={() => setActivePage(item.id)}
            >
              {activePage === item.id && (
                <span className="absolute top-1.5 w-4 h-0.5 rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 shadow-[0_0_8px_rgba(155,114,248,0.8)]" />
              )}
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
              <span className={`text-[10px] font-semibold leading-none tracking-wide ${activePage === item.id ? 'text-violet-200' : ''}`}>{item.label}</span>
              {item.id === 'player' && playlist.length > 0 && (
                <span className="absolute -mt-8.5 ml-8.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/80 text-white shadow-[0_0_8px_rgba(155,114,248,0.5)]">{playlist.length}</span>
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
