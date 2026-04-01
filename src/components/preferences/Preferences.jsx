import { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/mlApi';
import Icon from '../common/Icons';

export default function Preferences() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPreferences();
      setPrefs(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleReset = async () => {
    if (!confirm('Reset all preferences? This will clear all learned data.')) return;
    try {
      await api.resetPreferences();
      await loadPreferences();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-gradient inline-flex items-center gap-2"><Icon name="settings" className="h-8 w-8" />Preferences</span>
        </h1>
        <p className="page-subtitle">A clean view of what justVIBE has learned from your listening history.</p>
        {loading && (
          <div className="text-xs text-slate-400 mt-2 inline-flex items-center gap-2">
            <Icon name="refresh" className="h-3.5 w-3.5" /> Loading preferences...
          </div>
        )}
      </div>

      {/* Stats Overview */}
      <div className="grid-4 stagger" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon purple"><Icon name="brain" className="h-5 w-5" /></div>
          <div>
            <div className="stat-value">{prefs?.update_counts?.total_updates || 0}</div>
            <div className="stat-label">Learning Updates</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon cyan"><Icon name="equalizer" className="h-5 w-5" /></div>
          <div>
            <div className="stat-value">{prefs?.update_counts?.eq_updates || 0}</div>
            <div className="stat-label">EQ Tweaks Learned</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><Icon name="music" className="h-5 w-5" /></div>
          <div>
            <div className="stat-value">
              {prefs?.update_counts?.genre_updates ? Object.keys(prefs.update_counts.genre_updates).length : 0}
            </div>
            <div className="stat-label">Genres Explored</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Icon name="chart" className="h-5 w-5" /></div>
          <div>
            <div className="stat-value">{prefs?.session_count || 0}</div>
            <div className="stat-label">Listening Sessions</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Genre Activity */}
        <div className="card card-glow">
          <div className="card-header">
            <h3 className="card-title">
              <span className="card-title-icon"><Icon name="guitar" className="h-5 w-5" /></span>
              Genre Activity
            </h3>
          </div>

          {prefs?.update_counts?.genre_updates && Object.keys(prefs.update_counts.genre_updates).length > 0 ? (
            <div className="genre-bar-list">
              {Object.entries(prefs.update_counts.genre_updates)
                .sort(([, a], [, b]) => b - a)
                .map(([genre, count]) => {
                  const maxCount = Math.max(...Object.values(prefs.update_counts.genre_updates));
                  return (
                    <div key={genre} className="genre-bar-item">
                      <span className="genre-bar-label">{genre}</span>
                      <div className="genre-bar-track">
                        <div className="genre-bar-fill" style={{ width: `${(count / maxCount) * 100}%` }} />
                      </div>
                      <span className="genre-bar-value">{count}</span>
                    </div>
                  );
                })
              }
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '32px' }}>
              <div className="empty-state-icon" style={{ fontSize: '2.5rem' }}><Icon name="music" className="h-10 w-10" /></div>
              <div className="empty-state-text" style={{ fontSize: '0.85rem' }}>
                No genre data yet. Listen to music and let justVIBE learn your preferences!
              </div>
            </div>
          )}
        </div>

        {/* Learning Summary */}
        <div className="card card-glow">
          <div className="card-header">
            <h3 className="card-title">
              <span className="card-title-icon"><Icon name="analysis" className="h-5 w-5" /></span>
              Learning Summary
            </h3>
          </div>

          <div>
            <div className="pref-item">
              <span className="pref-label">Most Active Genre</span>
              <span className="pref-value" style={{ textTransform: 'capitalize' }}>
                {prefs?.update_counts?.genre_updates && Object.keys(prefs.update_counts.genre_updates).length > 0
                  ? Object.entries(prefs.update_counts.genre_updates).sort(([, a], [, b]) => b - a)[0][0]
                  : '—'}
              </span>
            </div>

            <div className="pref-item">
              <span className="pref-label">Most Frequent Genre Count</span>
              <span className="pref-value">
                {prefs?.update_counts?.genre_updates && Object.keys(prefs.update_counts.genre_updates).length > 0
                  ? Object.entries(prefs.update_counts.genre_updates).sort(([, a], [, b]) => b - a)[0][1]
                  : 0}
              </span>
            </div>

            <div className="pref-item">
              <span className="pref-label">EQ vs Total Update Ratio</span>
              <span className="pref-value">
                {prefs?.update_counts?.total_updates
                  ? `${Math.round(((prefs?.update_counts?.eq_updates || 0) / prefs.update_counts.total_updates) * 100)}%`
                  : '0%'}
              </span>
            </div>

            <div className="pref-item">
              <span className="pref-label">Data State</span>
              <span className="tag tag-green">Healthy</span>
            </div>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={loadPreferences} style={{ flex: 1, justifyContent: 'center' }}>
                <Icon name="refresh" className="h-4 w-4" /> Refresh
              </button>
              <button className="btn btn-secondary" onClick={handleReset} style={{ flex: 1, justifyContent: 'center' }}>
                <Icon name="trash" className="h-4 w-4" /> Reset Data
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginTop: '24px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <span className="inline-flex items-center gap-2" style={{ color: 'var(--accent-danger)' }}>
            <Icon name="warning" className="h-4 w-4" /> Failed to load preferences: {error}
          </span>
        </div>
      )}
    </div>
  );
}
