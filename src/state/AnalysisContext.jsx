import { createContext, useContext, useState, useCallback } from 'react';
import * as api from '../services/mlApi';

const AnalysisContext = createContext(null);

export function AnalysisProvider({ children }) {
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('unknown'); // ok, offline, unknown
  const [modelStatus, setModelStatus] = useState(null);

  const checkBackend = useCallback(async () => {
    try {
      const health = await api.checkHealth();
      setBackendStatus(health.status === 'ok' ? 'ok' : 'offline');
      const models = await api.getModelStatus();
      setModelStatus(models.models || null);
      return health.status === 'ok';
    } catch {
      setBackendStatus('offline');
      return false;
    }
  }, []);

  const runAnalysis = useCallback(async (file) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await api.fullAnalysisFromFile(file);
      setAnalysisResult(result);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const clearAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setError(null);
  }, []);

  const value = {
    analysisResult,
    isAnalyzing,
    error,
    backendStatus,
    modelStatus,
    checkBackend,
    runAnalysis,
    clearAnalysis,
  };

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider');
  return ctx;
}
