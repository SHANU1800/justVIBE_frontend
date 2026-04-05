import { useRef, useCallback, useEffect, useState } from 'react';
import { usePlayer } from '../../state/PlayerContext';
import { useRealtimeGenre } from '../../state/RealtimeGenreContext';
import { getModeRecommendationFromFile } from '../../services/mlApi';
import Icon from '../common/Icons';

export default function Player({
  userMood = 'chill',
  onMoodChange = () => {},
  listeningMode: controlledListeningMode,
  onListeningModeChange,
  modeHint: controlledModeHint,
}) {
  const {
    playlist, currentTrack, currentTrackIndex, isPlaying,
    addFiles, dispatch, togglePlay, play, pause, applyListeningMode
  } = usePlayer();
  const { preprocessCurrentTrack } = useRealtimeGenre();
  const fileRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [listeningMode, setListeningMode] = useState('Normal');
  const [modeHint, setModeHint] = useState('');
  const effectiveListeningMode = controlledListeningMode ?? listeningMode;
  const effectiveModeHint = controlledModeHint ?? modeHint;

  const PLAYER_MODES = [
    { value: 'Normal', label: 'Normal' },
    { value: 'Enhanced', label: 'Enhanced' },
    { value: 'Lo-Fi', label: 'Lo-Fi' },
    { value: 'DJ', label: 'DJ (Untrained)' },
  ];

  const handleListeningModeChange = useCallback(async (mode) => {
    if (onListeningModeChange) {
      onListeningModeChange(mode);
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
      const result = await getModeRecommendationFromFile(currentTrack.file, mode);
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
  }, [onListeningModeChange, applyListeningMode, currentTrack]);

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
    if (!currentTrack?.file || effectiveListeningMode === 'Normal') return;

    applyListeningMode(effectiveListeningMode);

    getModeRecommendationFromFile(currentTrack.file, effectiveListeningMode)
      .then((result) => {
        if (result?.status === 'ok') {
          applyListeningMode(effectiveListeningMode, result);
        }
      })
      .catch(() => {});
  }, [currentTrack, effectiveListeningMode, applyListeningMode]);

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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Playlist Panel */}
        <div className="xl:col-span-8 rounded-2xl border border-white/[0.07] border-t-white/[0.11] bg-[rgba(8,10,24,0.8)] backdrop-blur-2xl p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset,0_20px_80px_rgba(0,0,0,0.55)] min-h-0">
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
            <div className="playlist overflow-y-auto pr-1 max-h-[50vh] xl:max-h-[58vh]">
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

        {/* Now Playing Panel */}
        <div className="xl:col-span-4 rounded-2xl border border-white/[0.07] border-t-white/[0.11] bg-[rgba(8,10,24,0.8)] backdrop-blur-2xl p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset,0_20px_80px_rgba(0,0,0,0.55)] min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Icon name="headphones" className="h-5 w-5" />
              Now Playing
            </h3>
          </div>

          {currentTrack ? (
            <div className="flex flex-col items-center gap-4">
              {/* Compact Cover Art */}
              <div style={{
                width: 'min(38vw, 132px)',
                aspectRatio: '1 / 1',
                borderRadius: '14px',
                background: 'var(--gradient-neon)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                  boxShadow: isPlaying ? '0 0 40px rgba(155,114,248,0.55), 0 0 80px rgba(155,114,248,0.2)' : '0 4px 20px rgba(0,0,0,0.5)',
                transition: 'all 0.5s ease',
                animation: isPlaying ? 'cover-pulse 3s ease-in-out infinite' : 'none',
              }}>
                <Icon name="music" className="h-11 w-11 text-white" />
              </div>

              {/* Track Info */}
              <div style={{ textAlign: 'center', width: '100%', maxWidth: '28rem' }}>
                <div className="truncate" style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '2px' }}>
                  {currentTrack.name}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {isPlaying ? 'Playing now' : 'Ready to play'}
                </div>
              </div>

              {/* Listening Modes */}
              <div className="player-mode-row">
                <span className="player-mode-label">Listening Mode</span>
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
                <div className="text-[11px] text-slate-400 text-center -mt-2">{effectiveModeHint}</div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon inline-flex items-center justify-center"><Icon name="music" className="h-14 w-14" /></div>
              <div className="empty-state-title">No Track Selected</div>
              <div className="empty-state-text">
                Import some music files to start your justVIBE experience
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
