/**
 * The front desk: one question ("Which repo are we hanging?"), one box, and an
 * empty frame that fills with commits while the repo is read.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type SubmitEvent } from 'react';
import { formatMomentDate, makeMoment, useGraphStore } from '@lib/store/graph-store';
import { snapshotGraphAt } from '@lib/git/graph';
import type { RepoGraph } from '@lib/git/types';
import { cleanSourceName, repoDisplayName } from '@lib/utils/repo-name';
import { debugError } from '@lib/utils/debug';

const DEFAULT_MAX_COMMITS = 1000;
const SAMPLE_DEMO = 'showcase';
const SUGGESTED_REPOS = ['sveltejs/svelte', 'facebook/react', 'rust-lang/rust', 'torvalds/linux'];
/** Most dots the frame will draw, however large the history. */
const MAX_DOTS = 84;

type Provider = 'github' | 'gitlab' | 'bitbucket';

/** One file from an opened folder (structurally matches import-git's GitFolderEntry). */
interface GitFolderEntry {
  path: string;
  read: () => Promise<ArrayBuffer>;
}

function providerOf(url: string): Provider {
  if (url.includes('gitlab.com')) return 'gitlab';
  if (url.includes('bitbucket.org')) return 'bitbucket';
  return 'github';
}

/** Cut a freshly read history back to the chosen moment, if there is one. */
function asOfMoment(graph: RepoGraph): RepoGraph {
  const moment = useGraphStore.getState().moment;
  return moment ? snapshotGraphAt(graph, moment.untilMs) : graph;
}

/** Minimal shape of the File System Access API we use (not in every TS lib). */
interface DirHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string): Promise<DirHandle>;
  values(): AsyncIterable<DirHandle | FileHandle>;
}
interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

/** Collect the files under a .git directory handle that history parsing needs. */
async function collectGitDir(gitDir: DirHandle): Promise<GitFolderEntry[]> {
  const entries: GitFolderEntry[] = [];
  const walk = async (dir: DirHandle, path: string): Promise<void> => {
    for await (const child of dir.values()) {
      const childPath = `${path}/${child.name}`;
      if (child.kind === 'file') {
        entries.push({ path: childPath, read: async () => (await child.getFile()).arrayBuffer() });
      } else {
        await walk(child, childPath);
      }
    }
  };
  for await (const child of gitDir.values()) {
    if (child.kind === 'file') {
      if (child.name === 'HEAD' || child.name === 'packed-refs') {
        entries.push({ path: `.git/${child.name}`, read: async () => (await child.getFile()).arrayBuffer() });
      }
    } else if (child.name === 'refs' || child.name === 'objects') {
      await walk(child, `.git/${child.name}`);
    }
  }
  return entries;
}

/** Deterministic spot for the nth commit dot: an outward spiral inside the mat. */
function dotPosition(i: number): { left: string; top: string; big: boolean } {
  const t = i / MAX_DOTS;
  const angle = t * Math.PI * 2 * 3.4;
  const radius = 5 + t * 37;
  const jitter = ((i * 7919) % 13) / 13 - 0.5;
  return {
    left: `${50 + Math.cos(angle) * radius * 0.92 + jitter * 3}%`,
    top: `${50 + Math.sin(angle) * radius * 0.66 + jitter * 2}%`,
    big: i % 9 === 4,
  };
}

export function ImportPanel() {
  const {
    setGraph, setLoading, setError, setRepoPath, setAuthToken, setCurrentDemo, setSourceName, setImportStatus, setMoment,
    authToken, isLoading, error, importStatus, moment,
  } = useGraphStore();
  const [isDragging, setIsDragging] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [tokenInput, setTokenInput] = useState(authToken ?? '');
  const [showToken, setShowToken] = useState(false);
  const [momentDate, setMomentDate] = useState(moment?.date ?? '');
  const [momentLabel, setMomentLabel] = useState(moment?.label ?? '');
  const [rememberToken, setRememberToken] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(localStorage.getItem('git-sonar-auth-token'));
    } catch {
      return false;
    }
  });
  // While a local file is being read there is no commit count to report, so the
  // frame fills on a timer instead.
  const [pulse, setPulse] = useState(0);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [wasLoading, setWasLoading] = useState(isLoading);
  if (wasLoading !== isLoading) {
    setWasLoading(isLoading);
    setPulse(0);
  }

  useEffect(() => {
    if (!isLoading) return;
    const id = window.setInterval(() => setPulse((p) => p + 1), 140);
    return () => window.clearInterval(id);
  }, [isLoading]);

  const loadSample = useCallback(async () => {
    setLoading(true);
    setError(null);
    setImportStatus({ name: repoDisplayName(null, SAMPLE_DEMO), found: 0 });
    try {
      const { loadDemoDataset } = await import('@lib/demo-data');
      const graph = asOfMoment(await loadDemoDataset(SAMPLE_DEMO));
      setGraph(graph);
      setCurrentDemo(SAMPLE_DEMO);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the sample repo.');
    }
  }, [setGraph, setLoading, setError, setCurrentDemo, setImportStatus]);

  const importFromUrl = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) return;

      const provider = providerOf(url);
      const name = repoDisplayName(url, null);
      setLoading(true);
      setError(null);
      setImportStatus({ name, found: 0 });

      try {
        const token = tokenInput.trim() || undefined;
        const imports = await import('@lib/git/import-git');
        const options = {
          maxCommits: DEFAULT_MAX_COMMITS,
          authToken: token,
          // GitHub and GitLab can be asked for the history as of a day.
          until: useGraphStore.getState().moment?.untilMs,
          onProgress: (found: number) => setImportStatus({ name, found }),
        };
        const graph = provider === 'gitlab'
          ? await imports.parseGitLabRepo(url, options)
          : provider === 'bitbucket'
            ? asOfMoment(await imports.parseBitbucketRepo(url, options))
            : await imports.parseGitHubRepo(url, options);

        setAuthToken(token ?? null, rememberToken);
        setGraph(graph);
        setRepoPath(url, provider, graph.commits.size >= DEFAULT_MAX_COMMITS);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not fetch that repo.');
      }
    },
    [tokenInput, rememberToken, setGraph, setLoading, setError, setRepoPath, setAuthToken, setImportStatus]
  );

  const handleSubmit = useCallback(
    (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!repoUrl.trim()) {
        e.currentTarget.querySelector('input')?.focus();
        return;
      }
      void importFromUrl(repoUrl);
    },
    [importFromUrl, repoUrl]
  );

  const handleFile = useCallback(
    async (file: File) => {
      const name = cleanSourceName(file.name);
      setLoading(true);
      setError(null);
      setImportStatus({ name, found: 0 });

      try {
        if (file.name.endsWith('.zip')) {
          const { parseGitZip } = await import('@lib/git/import-git');
          setGraph(asOfMoment(await parseGitZip(file)));
          setSourceName(name);
        } else if (file.name.endsWith('.json')) {
          const { importFromFile } = await import('@lib/git/import-local');
          setGraph(asOfMoment(await importFromFile(file)));
          setSourceName(name);
        } else {
          setError('That file is not a .zip. Zip the .git folder, or open the project folder instead.');
        }
      } catch (err) {
        debugError('handleFile', err);
        setError(err instanceof Error ? err.message : 'Could not read that file.');
      }
    },
    [setGraph, setLoading, setError, setSourceName, setImportStatus]
  );

  const importFolder = useCallback(
    async (entries: GitFolderEntry[], folderName: string) => {
      const name = cleanSourceName(folderName);
      setLoading(true);
      setError(null);
      setImportStatus({ name, found: 0 });
      try {
        const { parseGitFolder } = await import('@lib/git/import-git');
        setGraph(asOfMoment(await parseGitFolder(entries)));
        setSourceName(name);
      } catch (err) {
        debugError('importFolder', err);
        setError(err instanceof Error ? err.message : 'Could not read that folder.');
      }
    },
    [setGraph, setLoading, setError, setSourceName, setImportStatus]
  );

  const openFolder = useCallback(async () => {
    const picker = (window as unknown as { showDirectoryPicker?: (o?: { mode?: 'read' }) => Promise<DirHandle> }).showDirectoryPicker;
    if (!picker) {
      folderInputRef.current?.click();
      return;
    }
    let dir: DirHandle;
    try {
      dir = await picker.call(window, { mode: 'read' });
    } catch {
      return; // the picker was dismissed
    }
    try {
      const gitDir = dir.name === '.git' ? dir : await dir.getDirectoryHandle('.git');
      setLoading(true);
      await importFolder(await collectGitDir(gitDir), dir.name === '.git' ? 'Local repo' : dir.name);
    } catch (err) {
      debugError('openFolder', err);
      setError('No .git folder found there. Pick the project folder that contains .git.');
    }
  }, [importFolder, setLoading, setError]);

  const handleFolderSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (files.length === 0) return;
      const entries: GitFolderEntry[] = files.map((file) => ({
        path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        read: () => file.arrayBuffer(),
      }));
      const root = entries[0].path.split('/')[0] ?? 'Local repo';
      await importFolder(entries, root);
    },
    [importFolder]
  );

  const handleZipSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) await handleFile(file);
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) await handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }, []);

  const found = importStatus?.found ?? 0;
  const dotCount = !isLoading ? 0 : found > 0 ? Math.min(MAX_DOTS, Math.ceil(found / 12)) : Math.min(MAX_DOTS, pulse);
  const dots = useMemo(() => Array.from({ length: MAX_DOTS }, (_, i) => dotPosition(i)), []);

  const labelTitle = isLoading ? importStatus?.name ?? 'Reading' : 'Untitled';
  const labelLine = !isLoading
    ? moment ? `Waiting for a repo, as of ${formatMomentDate(moment)}` : 'Waiting for a repo'
    : found > 0
      ? `${found.toLocaleString()} commits found`
      : 'Reading the history';

  return (
    <div
      className={`desk ${isDragging ? 'desk--dragging' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="desk__ask">
        <h1>Which repo are we hanging?</h1>

        <form className="desk__form" onSubmit={handleSubmit}>
          <input
            id="repository-url"
            name="repository-url"
            className="g-field"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="Paste a GitHub, GitLab or Bitbucket link"
            disabled={isLoading}
            aria-label="Repository URL"
          />
          <button type="submit" className="g-btn g-btn--red" disabled={isLoading} aria-busy={isLoading}>
            {isLoading ? 'Hanging' : 'Make poster'}
          </button>
        </form>

        <div className="desk__chips" role="group" aria-label="Public repos to try">
          <span>Or try</span>
          {SUGGESTED_REPOS.map((repo) => (
            <button key={repo} type="button" disabled={isLoading} onClick={() => { setRepoUrl(repo); void importFromUrl(repo); }}>
              {repo}
            </button>
          ))}
        </div>

        <div className="desk__alts">
          <button type="button" onClick={openFolder} disabled={isLoading}>
            <b>Open a folder on this computer</b>
            <span>Pick the project folder. No zipping, and it works offline.</span>
          </button>
          <button type="button" onClick={loadSample} disabled={isLoading}>
            <b>Use the sample repo</b>
            <span>Project Atlas: a year of work by eight people.</span>
          </button>
        </div>

        <details className="desk__more desk__moment">
          <summary>{moment ? `Capturing ${formatMomentDate(moment)}` : 'Capture an earlier moment'}</summary>
          <div className="desk__more-body">
            <p>
              Make the poster of the repo as it stood on a day worth remembering: a launch, a release, a star count.
            </p>
            <div className="desk__moment-row">
              <label>
                The day
                <input
                  className="g-field"
                  type="date"
                  name="moment-date"
                  value={momentDate}
                  disabled={isLoading}
                  onChange={(e) => {
                    setMomentDate(e.target.value);
                    setMoment(makeMoment(e.target.value, momentLabel));
                  }}
                />
              </label>
              <label>
                What happened
                <input
                  className="g-field"
                  type="text"
                  name="moment-label"
                  maxLength={80}
                  placeholder="Reached 1,000 stars"
                  value={momentLabel}
                  disabled={isLoading}
                  onChange={(e) => {
                    setMomentLabel(e.target.value);
                    setMoment(makeMoment(momentDate, e.target.value));
                  }}
                />
              </label>
            </div>
            <p>GitHub does not share the dates stars were given, so enter the day yourself. Leave the day empty for the repo as it is now.</p>
          </div>
        </details>

        <details className="desk__more">
          <summary>Private repo, rate limit, or a .git zip</summary>
          <div className="desk__more-body">
            <label htmlFor="repository-access-token">Access token</label>
            <div className="desk__token">
              <input
                id="repository-access-token"
                name="repository-access-token"
                className="g-field"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Optional"
                disabled={isLoading}
                aria-describedby="token-hint"
              />
              <button type="button" className="g-btn g-btn--line" onClick={() => setShowToken((prev) => !prev)} aria-label={showToken ? 'Hide token' : 'Show token'}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <p id="token-hint">
              A GitHub or GitLab token lifts rate limits and reaches private repos. For Bitbucket use username:appPassword. The token goes only to that provider.
            </p>
            <label className="desk__remember">
              <input name="remember-repository-token" type="checkbox" checked={rememberToken} onChange={(e) => setRememberToken(e.target.checked)} />
              Remember the token on this device
            </label>

            <button type="button" className="g-btn g-btn--line desk__zip" onClick={() => zipInputRef.current?.click()} disabled={isLoading}>
              Choose a .git zip
            </button>
            <p>
              You can also drop a zip anywhere on this page. To make one: <code>cd your-repo &amp;&amp; zip -r ../repo-git.zip .git</code>
            </p>
          </div>
        </details>

        <input
          ref={zipInputRef}
          id="repository-archive"
          name="repository-archive"
          type="file"
          accept=".zip,.json"
          onChange={handleZipSelect}
          aria-label="Repository archive"
          hidden
        />
        <input
          ref={folderInputRef}
          name="repository-folder"
          type="file"
          onChange={handleFolderSelect}
          aria-label="Repository folder"
          hidden
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />

        {error && (
          <p className="desk__error" role="alert">
            <span className="g-dot" aria-hidden="true" />
            {error}
          </p>
        )}

        <p className="desk__meter">
          Code sent to our servers: <b>0 bytes</b>. We do not have any.
        </p>
      </div>

      <div className="desk__wall" aria-live="polite">
        <div className="g-frame g-frame--oak desk__frame">
          <div className={`g-mat desk__mat ${isLoading ? 'is-busy' : ''}`}>
            <em>{isDragging ? 'Drop the zip here' : 'Empty, for now'}</em>
            {dots.slice(0, dotCount).map((d, i) => (
              <i key={i} className={d.big ? 'is-big' : undefined} style={{ left: d.left, top: d.top }} />
            ))}
          </div>
        </div>
        <div className="g-label desk__label">
          <b>{labelTitle}</b>
          <span>{labelLine}</span>
        </div>
      </div>
    </div>
  );
}
