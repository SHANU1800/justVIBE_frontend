import { useEffect, useRef } from 'react';
import { useAnalysis } from '../../state/AnalysisContext';
import { usePlayer } from '../../state/PlayerContext';
import Icon from '../common/Icons';

function getFeatureNumber(details, keys = []) {
  if (!details) return null;
  for (const key of keys) {
    const exact = details[key];
    if (typeof exact === 'number' && Number.isFinite(exact)) return exact;
  }
  for (const [k, value] of Object.entries(details)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (keys.some(candidate => k.toLowerCase().includes(candidate.toLowerCase()))) {
      return value;
    }
  }
  return null;
}

export default function Analysis() {
  const { analysisResult, isAnalyzing, error, runAnalysis, clearAnalysis } = useAnalysis();
  const { currentTrack } = usePlayer();
  const lastAutoTrackIdRef = useRef(null);

  useEffect(() => {
    if (!currentTrack?.file) {
      lastAutoTrackIdRef.current = null;
      return;
    }

    if (lastAutoTrackIdRef.current === currentTrack.id) return;
    lastAutoTrackIdRef.current = currentTrack.id;
    clearAnalysis();
    runAnalysis(currentTrack.file);
  }, [currentTrack, runAnalysis, clearAnalysis]);

  const circumference = 2 * Math.PI * 65;
  const qualityScore = analysisResult?.quality?.overall_score || 0;
  const qualityOffset = circumference - (qualityScore / 100) * circumference;
  const featureDetails = analysisResult?.features?.details || {};
  const topGenre = analysisResult?.genre?.top_genre || 'Unknown';
  const topGenreConfidence = Math.round((analysisResult?.genre?.confidence || 0) * 100);
  const tempoBpm = getFeatureNumber(featureDetails, ['tempo', 'bpm']);
  const spectralCentroid = getFeatureNumber(featureDetails, ['spectral_centroid', 'centroid']);
  const rmsLevel = getFeatureNumber(featureDetails, ['rms']);
  const zcr = getFeatureNumber(featureDetails, ['zero_crossing_rate', 'zcr']);
  const genreEntries = analysisResult?.genre?.genres && typeof analysisResult.genre.genres === 'object'
    ? Object.entries(analysisResult.genre.genres)
    : [];
  const qualityFactors = analysisResult?.quality?.factors && typeof analysisResult.quality.factors === 'object'
    ? Object.entries(analysisResult.quality.factors)
    : [];
  const eqRecommendation = analysisResult?.eq_recommendation;
  const eqBandEntries = eqRecommendation?.bands && typeof eqRecommendation.bands === 'object'
    ? Object.entries(eqRecommendation.bands)
    : [];

  const mixNotes = [];
  if (qualityScore >= 80) {
    mixNotes.push('Great baseline quality — only subtle EQ changes are recommended.');
  } else if (qualityScore >= 60) {
    mixNotes.push('Solid quality — mild enhancement and cleanup should improve clarity.');
  } else if (analysisResult) {
    mixNotes.push('Quality is on the lower side — use conservative processing and avoid over-boosting highs.');
  }
  if (typeof spectralCentroid === 'number') {
    if (spectralCentroid > 4200) mixNotes.push('Track is bright; consider taming upper mids/highs slightly for smoother playback.');
    if (spectralCentroid < 1800) mixNotes.push('Track is warm/dark; a small treble lift can improve articulation.');
  }
  if (typeof tempoBpm === 'number') {
    if (tempoBpm > 130) mixNotes.push('High energy tempo detected — shorter transitions and tighter dynamics tend to work best.');
    if (tempoBpm < 85) mixNotes.push('Lower tempo detected — longer transitions and wider ambience can sound more natural.');
  }

  return (
    <div className="fade-in analysis-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-gradient inline-flex items-center gap-2"><Icon name="analysis" className="h-8 w-8" />Analysis</span>
        </h1>
        <p className="page-subtitle">Auto-analysis for the current song only — genre detection, quality scoring, and audio feature extraction</p>
      </div>

      {/* Current track status */}
      <div className="card card-glow" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 className="card-title">
            <span className="card-title-icon"><Icon name="music" className="h-5 w-5" /></span>
            Current Song Analysis
          </h3>
          {currentTrack ? (
            <span className="tag tag-cyan" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTrack.name}
            </span>
          ) : (
            <span className="tag tag-amber">No track loaded</span>
          )}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Analysis runs automatically for the current track. Analyzing other files is disabled on this page.
        </div>
      </div>

      {!currentTrack && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', marginBottom: '24px' }}>
          <div className="empty-state-icon inline-flex items-center justify-center"><Icon name="music" className="h-12 w-12" /></div>
          <div className="empty-state-title">No current track</div>
          <div className="empty-state-text">Load a song in Player to see automatic analysis here.</div>
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="card" style={{ textAlign: 'center', padding: '64px 32px' }}>
          <div style={{ marginBottom: '20px', animation: 'cover-pulse 1.5s ease-in-out infinite' }} className="inline-flex"><Icon name="brain" className="h-12 w-12" /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '8px' }}>
            Analyzing Track...
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            Extracting features, detecting genre, scoring quality...
          </div>
          <div style={{ marginTop: '24px' }}>
            <div className="progress-bar" style={{ maxWidth: '300px', margin: '0 auto', height: '6px' }}>
              <div className="progress-fill" style={{ width: '60%', animation: 'shimmer 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span><Icon name="warning" className="h-6 w-6" /></span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Analysis Failed</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{error}</div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '12px' }}
            onClick={() => {
              if (currentTrack?.file) runAnalysis(currentTrack.file);
            }}
            disabled={!currentTrack?.file || isAnalyzing}
          >
            Retry Current Track
          </button>
        </div>
      )}

      {/* Results */}
      {analysisResult && (
        <>
          <div className="grid-2 stagger" style={{ marginBottom: '24px' }}>
            {/* Genre Detection */}
            <div className="card card-glow">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="card-title-icon"><Icon name="guitar" className="h-5 w-5" /></span>
                  Genre Detection
                </h3>
                {analysisResult.genre?.top_genre && (
                  <span className="tag tag-purple" style={{ textTransform: 'capitalize' }}>
                    {analysisResult.genre.top_genre}
                  </span>
                )}
              </div>

              {analysisResult.genre?.status === 'model_not_loaded' ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '16px 0' }}>
                  <span style={{ marginRight: '8px' }}><Icon name="info" className="inline h-4 w-4" /></span>
                  {analysisResult.genre.message}
                </div>
              ) : (
                <div className="genre-bar-list">
                  {genreEntries
                    .sort(([, a], [, b]) => b - a)
                    .map(([genre, prob]) => (
                      <div key={genre} className="genre-bar-item">
                        <span className="genre-bar-label">{genre}</span>
                        <div className="genre-bar-track">
                          <div className="genre-bar-fill" style={{ width: `${prob * 100}%` }} />
                        </div>
                        <span className="genre-bar-value">{(prob * 100).toFixed(1)}%</span>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            {/* Quality Score */}
            <div className="card card-glow">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="card-title-icon"><Icon name="diamond" className="h-5 w-5" /></span>
                  Quality Score
                </h3>
                {analysisResult.quality?.rating && (
                  <span className="tag tag-cyan">{analysisResult.quality.rating}</span>
                )}
              </div>

              <div className="quality-meter">
                <div className="quality-ring">
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <defs>
                      <linearGradient id="qualityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                    <circle className="quality-ring-bg" cx="80" cy="80" r="65" />
                    <circle
                      className="quality-ring-fill"
                      cx="80" cy="80" r="65"
                      strokeDasharray={circumference}
                      strokeDashoffset={qualityOffset}
                    />
                  </svg>
                  <div className="quality-score">
                    <div className="quality-score-value">{qualityScore.toFixed(0)}</div>
                    <div className="quality-score-label">Quality</div>
                  </div>
                </div>

                {/* Quality Factors */}
                {qualityFactors.length > 0 && (
                  <div style={{ width: '100%' }}>
                    {qualityFactors.map(([key, val]) => (
                      <div key={key} className="genre-bar-item" style={{ marginBottom: '8px' }}>
                        <span className="genre-bar-label" style={{ minWidth: '130px', textTransform: 'capitalize' }}>
                          {key.replace(/_/g, ' ')}
                        </span>
                        <div className="genre-bar-track">
                          <div className="genre-bar-fill" style={{
                            width: `${(val / 25) * 100}%`,
                            background: 'var(--gradient-cool)'
                          }} />
                        </div>
                        <span className="genre-bar-value">{val.toFixed(1)}/25</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: '24px' }}>
            <div className="card card-glow">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="card-title-icon"><Icon name="music" className="h-5 w-5" /></span>
                  Track Snapshot
                </h3>
              </div>

              <div className="grid-2" style={{ gap: '12px' }}>
                <div className="stat-card" style={{ padding: '12px' }}>
                  <div>
                    <div className="stat-value" style={{ fontSize: '1rem', textTransform: 'capitalize' }}>{topGenre}</div>
                    <div className="stat-label">Top Genre</div>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '12px' }}>
                  <div>
                    <div className="stat-value" style={{ fontSize: '1rem' }}>{topGenreConfidence}%</div>
                    <div className="stat-label">Genre Confidence</div>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '12px' }}>
                  <div>
                    <div className="stat-value" style={{ fontSize: '1rem' }}>{typeof tempoBpm === 'number' ? tempoBpm.toFixed(1) : '—'}</div>
                    <div className="stat-label">Tempo (BPM)</div>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '12px' }}>
                  <div>
                    <div className="stat-value" style={{ fontSize: '1rem' }}>{typeof rmsLevel === 'number' ? rmsLevel.toFixed(4) : '—'}</div>
                    <div className="stat-label">RMS Level</div>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '12px' }}>
                  <div>
                    <div className="stat-value" style={{ fontSize: '1rem' }}>{typeof spectralCentroid === 'number' ? spectralCentroid.toFixed(0) : '—'}</div>
                    <div className="stat-label">Spectral Centroid</div>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '12px' }}>
                  <div>
                    <div className="stat-value" style={{ fontSize: '1rem' }}>{typeof zcr === 'number' ? zcr.toFixed(4) : '—'}</div>
                    <div className="stat-label">Zero Crossing Rate</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-glow">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="card-title-icon"><Icon name="tool" className="h-5 w-5" /></span>
                  Mix Notes
                </h3>
              </div>

              {mixNotes.length > 0 ? (
                <div className="feature-list" style={{ maxHeight: 'none', gap: '8px' }}>
                  {mixNotes.map((note, idx) => (
                    <div key={`${note}-${idx}`} className="feature-item" style={{ alignItems: 'flex-start' }}>
                      <span className="tag tag-purple" style={{ marginTop: 1 }}>Tip</span>
                      <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{note}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Run analysis to get optimization notes for this track.
                </div>
              )}
            </div>
          </div>

          {/* Feature Extraction */}
          <div className="card card-glow">
            <div className="card-header">
              <h3 className="card-title">
                <span className="card-title-icon"><Icon name="chart" className="h-5 w-5" /></span>
                Extracted Features
              </h3>
              <span className="tag tag-amber">{analysisResult.features?.names?.length || 0} features</span>
            </div>

            {analysisResult.features?.details && (
              <div className="feature-list">
                {Object.entries(analysisResult.features.details).map(([name, value]) => {
                  const absVal = Math.abs(value);
                  const maxVal = name.includes('centroid') || name.includes('rolloff') || name.includes('bandwidth')
                    ? 10000 : name.includes('mfcc') ? 200 : name.includes('tempo') ? 250 : 1;
                  const pct = Math.min((absVal / maxVal) * 100, 100);

                  return (
                    <div key={name} className="feature-item">
                      <span className="feature-name">{name}</span>
                      <div className="feature-bar">
                        <div className="feature-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="feature-value">{typeof value === 'number' ? value.toFixed(4) : value}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* EQ Recommendation */}
          {eqRecommendation && (
            <div className="card card-glow" style={{ marginTop: '24px' }}>
              <div className="card-header">
                <h3 className="card-title">
                  <span className="card-title-icon"><Icon name="equalizer" className="h-5 w-5" /></span>
                  Smart EQ Recommendation
                </h3>
                <span className="tag tag-green">{eqRecommendation.preset_name || 'Unavailable'}</span>
              </div>

              {eqRecommendation.status === 'model_not_loaded' ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '16px 0' }}>
                  <span style={{ marginRight: '8px' }}><Icon name="info" className="inline h-4 w-4" /></span>
                  {eqRecommendation.message}
                </div>
              ) : eqBandEntries.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '16px 0' }}>
                  <span style={{ marginRight: '8px' }}><Icon name="info" className="inline h-4 w-4" /></span>
                  EQ recommendation data is unavailable for this track.
                </div>
              ) : (
                <div className="eq-container" style={{ minHeight: '120px', paddingBlock: '16px' }}>
                  {eqBandEntries.map(([freq, gain]) => (
                    <div key={freq} className="eq-band">
                      <div className="eq-value">{gain > 0 ? '+' : ''}{gain} dB</div>
                      <div style={{
                        width: '8px',
                        height: `${Math.abs(gain) * 4 + 8}px`,
                        background: gain >= 0 ? 'var(--gradient-primary)' : 'var(--gradient-warm)',
                        borderRadius: '4px',
                        transition: 'height 0.5s ease',
                      }} />
                      <div className="eq-label">{freq} Hz</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
