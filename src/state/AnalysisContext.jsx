import { createContext, useContext, useState, useCallback } from 'react';
import * as api from '../services/mlApi';

const AnalysisContext = createContext(null);

export function AnalysisProvider({ children }) {
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('unknown'); // ok, degraded, offline, unknown
  const [backendIssue, setBackendIssue] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);

  const hasMissingCoreModels = (models = {}) => {
    const coreKeys = ['justvibe_net', 'genre_classifier', 'eq_predictor'];
    return coreKeys.every((key) => !models?.[key]?.exists);
  };

  const checkBackend = useCallback(async () => {
    try {
      const health = await api.checkHealth();
      const models = await api.getModelStatus();
      const modelMap = models.models || null;
      setModelStatus(modelMap);

      if (health.status !== 'ok') {
        setBackendStatus('offline');
        setBackendIssue('Backend health check failed.');
        return false;
      }

      if (hasMissingCoreModels(modelMap)) {
        setBackendStatus('degraded');
        setBackendIssue('Backend is reachable, but ML model weight files are missing on the server.');
        return true;
      }

      setBackendStatus('ok');
      setBackendIssue(null);
      return true;
    } catch {
      setBackendStatus('offline');
      setBackendIssue('Cannot reach backend service.');
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
    backendIssue,
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
