import { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as api from '../services/mlApi';

const AnalysisContext = createContext(null);

export function AnalysisProvider({ children }) {
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('unknown'); // ok, degraded, offline, unknown
  const [backendIssue, setBackendIssue] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [modelDiagnostics, setModelDiagnostics] = useState(null);
  const backendCheckInFlightRef = useRef(false);
  const backendFailureCountRef = useRef(0);

  const hasMissingCoreModels = (models = {}, statusPayload = {}) => {
    if (typeof statusPayload?.core_models?.all_missing === 'boolean') {
      return statusPayload.core_models.all_missing;
    }

    const coreKeys = ['justvibe_net', 'genre_classifier', 'eq_predictor'];
    return coreKeys.every((key) => !models?.[key]?.exists);
  };

  const checkBackend = useCallback(async () => {
    if (backendCheckInFlightRef.current) {
      return false;
    }

    backendCheckInFlightRef.current = true;
    try {
      const health = await api.checkHealth({ timeout: 8000 });

      if (health.status !== 'ok') {
        setBackendStatus('offline');
        setBackendIssue('Backend health check failed.');
        return false;
      }

      backendFailureCountRef.current = 0;

      // Model status should not decide connectivity; keep it best-effort.
      let models = null;
      try {
        models = await api.getModelStatus({ timeout: 12000 });
      } catch {
        models = null;
      }

      const modelMap = models?.models || null;
      setModelStatus(modelMap);
      setModelDiagnostics({
        coreModels: models?.core_models || null,
        missingFiles: Array.isArray(models?.missing_files) ? models.missing_files : [],
        weightsDir: models?.weights_dir || null,
        deploymentHint: models?.deployment_hint || null,
      });

      if (models && hasMissingCoreModels(modelMap, models)) {
        const missingCore = models.core_models?.missing;
        const missingHint = Array.isArray(missingCore) && missingCore.length
          ? ` Missing core models: ${missingCore.join(', ')}.`
          : '';
        setBackendStatus('degraded');
        setBackendIssue(`Backend is reachable, but ML model weight files are missing on the server.${missingHint}`);
        return true;
      }

      setBackendStatus('ok');
      setBackendIssue(models ? null : 'Backend reachable. Model diagnostics temporarily unavailable.');
      return true;
    } catch (err) {
      backendFailureCountRef.current += 1;
      const message = err?.message || 'Cannot reach backend service.';

      // Avoid flipping to offline on one transient timeout.
      if (backendFailureCountRef.current >= 2) {
        setBackendStatus('offline');
        setBackendIssue(message);
      } else if (backendStatus === 'ok' || backendStatus === 'degraded') {
        setBackendIssue(`Temporary network issue: ${message}`);
      }
      return false;
    } finally {
      backendCheckInFlightRef.current = false;
    }
  }, [backendStatus]);

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
    modelDiagnostics,
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
