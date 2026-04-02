import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { usePlayer } from './PlayerContext';
import { getTimeline, preprocessTrack as preprocessTrackApi } from '../services/mlApi';

const RealtimeGenreContext = createContext(null);

const SEGMENT_DURATION = 3; // seconds

// EQ preset gains for each genre (dB, 10 bands)
// Used when JustVibeNet hasn't been trained yet as graceful fallback
const GENRE_EQ_FALLBACK = {
  blues:     [-2, 3, 4, 2, 0, 1, 2, 1, 0, -1],
  classical: [0, 0, 1, 1, 0, -1, -1, -2, -1, 0],
  country:   [1, 2, 2, 1, 0, 1, 2, 2, 2, 1],
  disco:     [5, 4, 1, 0, -1, 1, 2, 3, 3, 2],
  hiphop:    [6, 5, 3, 1, -1, -1, 1, 0, 2, 3],
  jazz:      [3, 2, 0, 2, -2, -2, 0, 2, 3, 4],
  metal:     [5, 4, 1, -1, -2, 1, 3, 4, 5, 5],
  pop:       [2, 2, 1, 0, 0, 1, 2, 3, 3, 2],
  reggae:    [5, 4, 2, 0, -1, -1, 0, 1, 2, 2],
  rock:      [5, 4, 2, 0, -1, 0, 2, 4, 5, 5],
  unknown:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function segmentGainsToArray(gainsObj) {
  if (!gainsObj) return GENRE_EQ_FALLBACK.unknown;
  return EQ_BANDS.map(b => gainsObj[String(b)] ?? 0);
}

export function RealtimeGenreProvider({ children }) {
  const { currentTrack, currentTime, isPlaying } = usePlayer();

  const [genreTimeline, setGenreTimeline] = useState([]);
  const [currentGenre, setCurrentGenre] = useState(null);
  const [currentSegmentEQ, setCurrentSegmentEQ] = useState(null);
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const [genreHistory, setGenreHistory] = useState([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [autoEQEnabled, setAutoEQEnabled] = useState(true);
  const [transitionDuration, setTransitionDuration] = useState(3);
  const [backendError, setBackendError] = useState(null);

  const lastTrackRef = useRef(null);
  const lastSegmentIdxRef = useRef(-1);
  const callbackRef = useRef(null);
  const timelineCacheRef = useRef(new Map());

  // Register an EQ change callback (called by Equalizer when it mounts)
  const registerEQCallback = useCallback((cb) => {
    callbackRef.current = cb;
  }, []);

  const preprocessCurrentTrack = useCallback(async (track = currentTrack, options = {}) => {
    const selectedTrack = track ?? currentTrack;
    if (!selectedTrack?.file) {
      return { status: 'error', message: 'No track selected', timeline: [] };
    }

    const force = Boolean(options.force);
    const cacheKey = selectedTrack.id;

    if (!force && timelineCacheRef.current.has(cacheKey)) {
      const cached = timelineCacheRef.current.get(cacheKey);
      setGenreTimeline(cached);
      setBackendError(null);
      return { status: 'ok', source: 'memory_cache', timeline: cached };
    }

    setIsLoadingTimeline(true);
    try {
      const result = await preprocessTrackApi(selectedTrack.file, force);
      if (result?.status === 'ok' && Array.isArray(result.timeline) && result.timeline.length > 0) {
        timelineCacheRef.current.set(cacheKey, result.timeline);
        setGenreTimeline(result.timeline);
        setBackendError(null);
        return result;
      }

      const fallback = await getTimeline(selectedTrack.file);
      if (fallback?.status === 'ok' && Array.isArray(fallback.timeline)) {
        timelineCacheRef.current.set(cacheKey, fallback.timeline);
        setGenreTimeline(fallback.timeline);
        setBackendError(null);
        return { ...fallback, source: 'timeline_fallback' };
      }

      setGenreTimeline([]);
      const finalResult = fallback ?? { status: 'error', message: 'Timeline unavailable', timeline: [] };
      setBackendError(finalResult?.message || 'ML server is unavailable. Please try again shortly.');
      return finalResult;
    } catch (error) {
      try {
        const fallback = await getTimeline(selectedTrack.file);
        if (fallback?.status === 'ok' && Array.isArray(fallback.timeline)) {
          timelineCacheRef.current.set(cacheKey, fallback.timeline);
          setGenreTimeline(fallback.timeline);
          setBackendError(null);
          return { ...fallback, source: 'timeline_fallback' };
        }
      } catch {
        // no-op
      }

      setGenreTimeline([]);
      const message = error?.message ?? 'Preprocess failed';
      setBackendError(message);
      return { status: 'error', message, timeline: [] };
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [currentTrack]);

  // Fetch timeline when track changes
  useEffect(() => {
    if (!currentTrack) {
      setGenreTimeline([]);
      setCurrentGenre(null);
      setCurrentSegmentEQ(null);
      setBackendError(null);
      lastTrackRef.current = null;
      lastSegmentIdxRef.current = -1;
      return;
    }

    if (currentTrack.id === lastTrackRef.current) return;
    lastTrackRef.current = currentTrack.id;
    lastSegmentIdxRef.current = -1;

    setCurrentGenre(null);
    setCurrentSegmentEQ(null);
    setGenreHistory([]);

    preprocessCurrentTrack(currentTrack);
  }, [currentTrack, preprocessCurrentTrack]);

  // Look up current segment genre as playback time advances
  useEffect(() => {
    if (!genreTimeline.length || !isPlaying) return;

    const segIdx = Math.floor(currentTime / SEGMENT_DURATION);
    if (segIdx === lastSegmentIdxRef.current) return;

    const seg = genreTimeline[segIdx];
    if (!seg) return;

    lastSegmentIdxRef.current = segIdx;

    const newGenre = seg.genre;
    const newConfidence = seg.confidence;
    const newEQGains = segmentGainsToArray(seg.eq_gains);

    setCurrentGenre(prev => {
      if (prev !== newGenre) {
        setGenreHistory(h => [
          { genre: newGenre, time: currentTime, confidence: newConfidence },
          ...h.slice(0, 9),
        ]);
      }
      return newGenre;
    });
    setCurrentConfidence(newConfidence);
    setCurrentSegmentEQ(newEQGains);

    // Fire EQ change callback if auto-EQ is on
    if (autoEQEnabled && callbackRef.current) {
      callbackRef.current(newEQGains, newGenre, transitionDuration);
    }
  }, [currentTime, genreTimeline, isPlaying, autoEQEnabled, transitionDuration]);

  const getSegmentAtTime = useCallback((time) => {
    if (!genreTimeline.length) return null;
    const idx = Math.floor(time / SEGMENT_DURATION);
    return genreTimeline[idx] ?? null;
  }, [genreTimeline]);

  const getFallbackEQ = useCallback((genre) => {
    return GENRE_EQ_FALLBACK[genre] ?? GENRE_EQ_FALLBACK.unknown;
  }, []);

  const value = {
    genreTimeline,
    currentGenre,
    currentSegmentEQ,
    currentConfidence,
    genreHistory,
    isLoadingTimeline,
    autoEQEnabled,
    setAutoEQEnabled,
    transitionDuration,
    setTransitionDuration,
    backendError,
    clearBackendError: () => setBackendError(null),
    getSegmentAtTime,
    getFallbackEQ,
    preprocessCurrentTrack,
    registerEQCallback,
    GENRE_EQ_FALLBACK,
  };

  return (
    <RealtimeGenreContext.Provider value={value}>
      {children}
    </RealtimeGenreContext.Provider>
  );
}

export function useRealtimeGenre() {
  const ctx = useContext(RealtimeGenreContext);
  if (!ctx) throw new Error('useRealtimeGenre must be used within RealtimeGenreProvider');
  return ctx;
}
