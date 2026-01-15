import { useCallback, useState, useRef, useEffect, type DragEvent, type ChangeEvent, type KeyboardEvent, type FormEvent } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import { parseGitZip, parseGitHubRepo, parseGitLabRepo, parseBitbucketRepo } from '@lib/git/import-git';
import { getDemoDatasets, loadDemoDataset } from '@lib/demo-data';
import { debugError } from '@lib/utils/debug';
import { FileText, GitBranch, Network, Package, AlertTriangle, Link } from 'lucide-react';

const DEFAULT_MAX_COMMITS = 1000;
const DEMO_SIZE_PRESETS = {
  small: { label: 'Small', dataset: 'simple' },
  medium: { label: 'Medium', dataset: 'branching' },
  large: { label: 'Large', dataset: 'complex' },
} as const;

// Map icon names to components
const ICON_MAP = {
  'file-text': FileText,
  'git-branch': GitBranch,
  'network': Network,
} as const;

export function ImportPanel() {
  const { setGraph, setLoading, setError, setRepoPath, setAuthToken, authToken, isLoading, error } = useGraphStore();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState<string>('branching');
  const [demoSize, setDemoSize] = useState<keyof typeof DEMO_SIZE_PRESETS>('medium');
  const [showDemoOptions, setShowDemoOptions] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [tokenInput, setTokenInput] = useState(authToken ?? '');
  const [showToken, setShowToken] = useState(false);
  const [rememberToken, setRememberToken] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(localStorage.getItem('git-sonar-auth-token'));
    } catch {
      return false;
    }
  });
  const zipInputRef = useRef<HTMLInputElement>(null);

  const demoDatasets = getDemoDatasets();

  const handleDemoClick = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const graph = await loadDemoDataset(key);
      setGraph(graph);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo');
    }
  }, [setGraph, setLoading, setError]);

  useEffect(() => {
    const preset = DEMO_SIZE_PRESETS[demoSize];
    if (!preset) return;
    setSelectedDemo(preset.dataset);
  }, [demoSize]);

  const syncDemoSize = useCallback((key: string) => {
    if (key === 'simple') {
      setDemoSize('small');
      return;
    }
    if (key === 'complex') {
      setDemoSize('large');
      return;
    }
    setDemoSize('medium');
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);

      try {
        if (file.name.endsWith('.zip')) {
          // ZIP file containing .git folder
          const graph = await parseGitZip(file);
          setGraph(graph);
        } else if (file.name.endsWith('.json')) {
          // Legacy JSON export
          const { importFromFile } = await import('@lib/git/import-local');
          const graph = await importFromFile(file);
          setGraph(graph);
        } else {
          setError('Please drop a .zip or .json file');
        }
      } catch (err) {
        debugError('handleFile', err);
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setLoading(false);
      }
    },
    [setGraph, setLoading, setError]
  );

  const handleZipSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        await handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDropzoneKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      zipInputRef.current?.click();
    }
  }, []);

  const handleGitHubSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!githubUrl.trim()) return;

      setLoading(true);
      setError(null);

      try {
        const trimmedUrl = githubUrl.trim();
        const authTokenValue = tokenInput.trim() || undefined;
        let graph;
        let provider: 'github' | 'gitlab' | 'bitbucket' = 'github';

        if (trimmedUrl.includes('gitlab.com')) {
          provider = 'gitlab';
          graph = await parseGitLabRepo(trimmedUrl, { maxCommits: DEFAULT_MAX_COMMITS, authToken: authTokenValue });
        } else if (trimmedUrl.includes('bitbucket.org')) {
          provider = 'bitbucket';
          graph = await parseBitbucketRepo(trimmedUrl, { maxCommits: DEFAULT_MAX_COMMITS, authToken: authTokenValue });
        } else {
          graph = await parseGitHubRepo(trimmedUrl, { maxCommits: DEFAULT_MAX_COMMITS, authToken: authTokenValue });
        }

        setAuthToken(authTokenValue ?? null, rememberToken);
        setGraph(graph);
        const hasMore = graph.commits.size >= DEFAULT_MAX_COMMITS;
        setRepoPath(trimmedUrl, provider, hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch repository');
      }
    },
    [githubUrl, tokenInput, rememberToken, setGraph, setLoading, setError, setRepoPath, setAuthToken]
  );

  return (
    <div className="import-panel">
      <div className="import-options">
        {/* Demo button with dropdown */}
        <div className="demo-section">
          <div className="demo-size" role="group" aria-label="Demo size">
            {Object.entries(DEMO_SIZE_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                className={`demo-size__btn ${demoSize === key ? 'demo-size__btn--active' : ''}`}
                onClick={() => setDemoSize(key as keyof typeof DEMO_SIZE_PRESETS)}
                disabled={isLoading}
                aria-pressed={demoSize === key}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowDemoOptions(!showDemoOptions)}
            disabled={isLoading}
            className="import-btn import-btn--demo"
            aria-label="Load Demo"
          >
            <span className="import-btn__icon">
              {(() => {
                const IconComponent = ICON_MAP[demoDatasets[selectedDemo]?.iconName ?? 'git-branch'];
                return <IconComponent size={32} />;
              })()}
            </span>
            <span className="import-btn__label">Load Demo</span>
            <span className="import-btn__desc">Choose a sample repository</span>
          </button>

          {showDemoOptions && (
            <div className="demo-dropdown">
              {Object.entries(demoDatasets).map(([key, dataset]) => {
                const IconComponent = ICON_MAP[dataset.iconName];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDemo(key);
                      syncDemoSize(key);
                      setShowDemoOptions(false);
                      handleDemoClick(key);
                    }}
                    disabled={isLoading}
                    className={`demo-option ${selectedDemo === key ? 'demo-option--selected' : ''}`}
                  >
                    <span className="demo-option__icon"><IconComponent size={24} /></span>
                    <div className="demo-option__content">
                      <span className="demo-option__name">{dataset.name}</span>
                      <span className="demo-option__desc">{dataset.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Git hosting URL input */}
        <form onSubmit={handleGitHubSubmit} className="github-form">
          <div className="github-form__header">
            <span className="github-form__icon"><Link size={20} /></span>
            <span className="github-form__label">Import from GitHub / GitLab / Bitbucket</span>
          </div>
          <div className="github-form__input-row">
            <input
              type="text"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo or https://gitlab.com/owner/repo"
              className="github-form__input"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !githubUrl.trim()}
              className="github-form__submit"
            >
              Import
            </button>
          </div>
          <div className="github-form__token">
            <div className="github-form__token-row">
              <input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Access token (optional)"
                className="github-form__input"
                disabled={isLoading}
                aria-label="Access token"
                aria-describedby="token-hint"
              />
              <button
                type="button"
                className="github-form__token-toggle"
                onClick={() => setShowToken((prev) => !prev)}
                aria-label={showToken ? "Hide token" : "Show token"}
                title={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
            <span id="token-hint" className="github-form__token-hint">
              Use a GitHub or GitLab token to avoid rate limits, or Bitbucket username:appPassword. Tokens stay in your browser.
            </span>
            <label className="github-form__remember">
              <input
                type="checkbox"
                checked={rememberToken}
                onChange={(e) => setRememberToken(e.target.checked)}
              />
              Remember token on this device (avoid shared computers)
            </label>
          </div>
          <span className="github-form__desc">Supports public repos on GitHub, GitLab, and Bitbucket</span>
        </form>

        {/* ZIP drop zone */}
        <div
          className={`dropzone ${isDragging ? 'dropzone--active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => zipInputRef.current?.click()}
          onKeyDown={handleDropzoneKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Drop .git.zip or click to choose"
        >
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,.json"
            onChange={handleZipSelect}
            style={{ display: 'none' }}
          />
          <span className="dropzone__icon"><Package size={32} /></span>
            <span className="dropzone__label">
            {isDragging ? 'Drop it!' : 'Drop .git.zip (your .git folder)'}
          </span>
          <span className="dropzone__desc">
            Or click to browse for a ZIP that contains your .git folder
          </span>
        </div>
      </div>

      {/* Instructions */}
      <div className="import-help">
        <details>
          <summary>How do I create a .git.zip?</summary>
          <div className="import-help__content">
            <p>The .git folder is a hidden folder inside your repo. Zip only the .git folder:</p>
            <code>cd your-repo && zip -r ../git-export.zip .git</code>
            <p className="import-help__note">
              If your repo uses worktrees, run <code>git rev-parse --git-dir</code> and zip that path instead.
            </p>
            <p className="import-help__note">
              Only the <code>.git</code> folder is needed, not your source files.
            </p>
          </div>
        </details>
      </div>

      {/* Error display */}
      {error && (
        <div className="import-error" role="alert">
          <span className="import-error__icon"><AlertTriangle size={18} /></span>
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="import-loading" aria-live="polite">
          <div className="import-loading__spinner" />
          <span>Parsing repository...</span>
        </div>
      )}

      <style>{`
        .import-panel {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 420px;
          margin: 0 auto;
        }

        .import-options {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .import-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem;
          border: 2px solid var(--rp-highlight-med);
          border-radius: 12px;
          background: var(--rp-surface);
          color: var(--rp-text);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }

        .import-btn:hover:not(:disabled) {
          border-color: var(--rp-iris);
          background: var(--rp-overlay);
          transform: translateY(-2px);
        }

        .import-btn:focus-visible {
          outline: 2px solid var(--rp-iris);
          outline-offset: 2px;
        }

        .import-btn--disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .demo-section {
          position: relative;
        }

        .demo-size {
          display: inline-flex;
          gap: 0.35rem;
          padding: 0.35rem;
          background: rgba(38, 35, 58, 0.5);
          border: 1px solid var(--rp-highlight-low);
          border-radius: 10px;
          margin-bottom: 0.5rem;
        }

        .demo-size__btn {
          border: 1px solid transparent;
          background: transparent;
          color: var(--rp-subtle);
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.35rem 0.6rem;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .demo-size__btn--active {
          border-color: var(--rp-foam);
          color: var(--rp-text);
          background: rgba(156, 207, 216, 0.12);
        }

        .demo-size__btn:hover:not(:disabled) {
          border-color: var(--rp-iris);
          color: var(--rp-text);
        }

        .demo-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          left: 0;
          right: 0;
          z-index: 10;
          background: var(--rp-surface);
          border: 1px solid var(--rp-highlight-med);
          border-radius: 12px;
          box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.4);
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .demo-option {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 8px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--rp-text);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
        }

        .demo-option:hover {
          background: var(--rp-overlay);
          border-color: var(--rp-foam);
        }

        .demo-option--selected {
          background: rgba(156, 207, 216, 0.1);
          border-color: var(--rp-foam);
        }

        .demo-option__icon {
          font-size: 1.5rem;
        }

        .demo-option__content {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .demo-option__name {
          font-size: 0.95rem;
          font-weight: 600;
        }

        .demo-option__desc {
          font-size: 0.8rem;
          color: var(--rp-subtle);
        }

        .github-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1.25rem;
          border: 2px solid var(--rp-highlight-med);
          border-radius: 12px;
          background: var(--rp-surface);
        }

        .github-form:focus-within {
          border-color: var(--rp-iris);
        }

        .github-form__header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .github-form__icon {
          font-size: 1.25rem;
        }

        .github-form__label {
          font-size: 1rem;
          font-weight: 600;
          color: var(--rp-text);
        }

        .github-form__input-row {
          display: flex;
          gap: 0.5rem;
        }

        .github-form__token {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .github-form__token-row {
          display: flex;
          gap: 0.5rem;
        }

        .github-form__token-toggle {
          padding: 0.625rem 0.85rem;
          border: 1px solid var(--rp-highlight-med);
          border-radius: 8px;
          background: var(--rp-surface);
          color: var(--rp-text);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .github-form__token-toggle:hover:not(:disabled) {
          border-color: var(--rp-iris);
          transform: translateY(-1px);
        }

        .github-form__token-toggle:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .github-form__token-hint {
          font-size: 0.75rem;
          color: var(--rp-muted);
        }

        .github-form__remember {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--rp-subtle);
        }

        .github-form__remember input {
          accent-color: var(--rp-iris);
        }

        .github-form__input {
          flex: 1;
          padding: 0.625rem 0.875rem;
          border: 1px solid var(--rp-highlight-med);
          border-radius: 8px;
          background: var(--rp-overlay);
          color: var(--rp-text);
          font-size: 0.9rem;
        }

        .github-form__input::placeholder {
          color: var(--rp-muted);
        }

        .github-form__input:focus {
          outline: none;
          border-color: var(--rp-iris);
        }

        .github-form__submit {
          padding: 0.625rem 1rem;
          border: none;
          border-radius: 8px;
          background: var(--rp-iris);
          color: var(--rp-base);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .github-form__submit:hover:not(:disabled) {
          background: var(--rp-foam);
          transform: translateY(-1px);
        }

        .github-form__submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .github-form__desc {
          font-size: 0.8rem;
          color: var(--rp-subtle);
          text-align: center;
        }

        .import-btn__icon {
          font-size: 2rem;
        }

        .import-btn__label {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .import-btn__desc {
          font-size: 0.85rem;
          color: var(--rp-subtle);
        }

        .dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 2rem 1.5rem;
          border: 2px dashed var(--rp-highlight-med);
          border-radius: 12px;
          background: var(--rp-surface);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }

        .dropzone:hover,
        .dropzone--active {
          border-color: var(--rp-foam);
          background: var(--rp-overlay);
        }

        .dropzone--active {
          transform: scale(1.02);
          border-style: solid;
        }

        .dropzone__icon {
          font-size: 2rem;
        }

        .dropzone__label {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--rp-text);
        }

        .dropzone__desc {
          font-size: 0.85rem;
          color: var(--rp-subtle);
        }

        .import-help {
          padding: 0.75rem 1rem;
          background: var(--rp-surface);
          border-radius: 8px;
        }

        .import-help summary {
          cursor: pointer;
          color: var(--rp-subtle);
          font-size: 0.9rem;
        }

        .import-help summary:hover {
          color: var(--rp-text);
        }

        .import-help__content {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--rp-highlight-low);
        }

        .import-help__content p {
          margin: 0 0 0.5rem;
          color: var(--rp-subtle);
          font-size: 0.85rem;
        }

        .import-help__content code {
          display: block;
          padding: 0.75rem 1rem;
          background: var(--rp-overlay);
          border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          color: var(--rp-foam);
          word-break: break-all;
        }

        .import-help__note {
          margin-top: 0.75rem !important;
        }

        .import-help__note code {
          display: inline;
          padding: 0.1em 0.3em;
        }

        .import-error {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: rgba(235, 111, 146, 0.15);
          border: 1px solid var(--rp-love);
          border-radius: 8px;
          color: var(--rp-love);
          font-size: 0.9rem;
        }

        .import-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem;
          color: var(--rp-subtle);
        }

        .import-loading__spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--rp-highlight-med);
          border-top-color: var(--rp-iris);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
