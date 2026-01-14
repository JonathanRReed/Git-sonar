import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@lib/store/graph-store';

export function CommitDetailsDialog() {
    const { selectedId, graph, showDetails, toggleDetails, theme } = useGraphStore();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const copyTimeoutRef = useRef<number | null>(null);
    const [copiedCommitId, setCopiedCommitId] = useState<string | null>(null);

    const commit = selectedId && graph ? graph.commits.get(selectedId) : null;

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (showDetails && commit) {
            if (!dialog.open) {
                dialog.showModal();
            }
        } else if (dialog.open) {
            dialog.close();
        }
    }, [showDetails, commit]);

    // Handle escape key
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const handleClose = () => {
            if (useGraphStore.getState().showDetails) {
                toggleDetails();
            }
        };
        dialog.addEventListener('close', handleClose);
        return () => dialog.removeEventListener('close', handleClose);
    }, [toggleDetails]);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) {
                window.clearTimeout(copyTimeoutRef.current);
            }
        };
    }, []);

    if (!commit) return null;

    const date = new Date(commit.authoredAt);
    const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    const parentCount = commit.parents.length;
    const isMerge = parentCount > 1;
    const isRoot = parentCount === 0;

    const handleCopySha = async () => {
        if (!commit) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(commit.id);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = commit.id;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            if (copyTimeoutRef.current) {
                window.clearTimeout(copyTimeoutRef.current);
            }
            setCopiedCommitId(commit.id);
            copyTimeoutRef.current = window.setTimeout(() => setCopiedCommitId(null), 1500);
        } catch {
            setCopiedCommitId(null);
        }
    };

    // Get lane color for styling
    const lane = graph?.lanes.get(commit.id) ?? 0;
    const laneColors = [
        theme.colors.foam,
        theme.colors.iris,
        theme.colors.gold,
        theme.colors.love,
        theme.colors.rose,
        theme.colors.pine,
    ];
    const laneColor = laneColors[lane % laneColors.length];

    return (
        <dialog ref={dialogRef} className="commit-dialog" aria-labelledby="commit-title">
            {/* Backdrop blur overlay */}
            <div className="commit-dialog__backdrop" onClick={toggleDetails}></div>

            <div className="commit-dialog__content">
                <div className="commit-dialog__header">
                    <div className="commit-icon" style={{ background: laneColor }}>
                        {isRoot && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7-7-7 7"/></svg>}
                        {isMerge && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4l-6 4 6 4M12 8v12M8 16l4 4"/></svg>}
                        {!isRoot && !isMerge && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8"/></svg>}
                    </div>
                    <h2 id="commit-title" className="commit-dialog__title">
                        {commit.messageSubject}
                    </h2>
                    <button
                        type="button"
                        className="commit-dialog__close"
                        onClick={toggleDetails}
                        aria-label="Close dialog"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div className="commit-dialog__body">
                    <dl className="commit-details">
                        <div className="commit-details__row">
                            <dt>Commit SHA</dt>
                            <dd className="commit-sha">
                                <code className="sha-full">{commit.id}</code>
                            </dd>
                        </div>

                        <div className="commit-details__row">
                            <dt>Author</dt>
                            <dd className="commit-author">
                                <div className="author-avatar" style={{ background: laneColor }}>
                                    {commit.authorName.charAt(0).toUpperCase()}
                                </div>
                                <span>{commit.authorName}</span>
                            </dd>
                        </div>

                        <div className="commit-details__row">
                            <dt>Committed</dt>
                            <dd className="commit-date">
                                <span className="date-full">{formattedDate}</span>
                            </dd>
                        </div>

                        <div className="commit-details__row">
                            <dt>Parent{parentCount !== 1 ? 's' : ''}</dt>
                            <dd>
                                {parentCount === 0 && <span className="commit-tag commit-tag--root">
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 4v8M4 8l4-4 4 4"/></svg>
                                    Root commit
                                </span>}
                                {parentCount === 1 && <code className="parent-sha">{commit.parents[0]}</code>}
                                {isMerge && (
                                    <div className="commit-parents">
                                        <span className="commit-tag commit-tag--merge">
                                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 4l-4 4 6 4M8 8v4"/></svg>
                                            Merge
                                        </span>
                                        {commit.parents.map((parentSha: string, index: number) => (
                                            <code key={parentSha} className="parent-sha">{parentSha}{index < parentCount - 1 ? ', ' : ''}</code>
                                        ))}
                                    </div>
                                )}
                            </dd>
                        </div>

                        {commit.stats && (
                            <div className="commit-details__row commit-stats-row">
                                <dt>Changes</dt>
                                <dd className="commit-stats">
                                    {commit.stats.additions !== undefined && (
                                        <div className="commit-stat commit-stat--add">
                                            <span className="stat-icon">+</span>
                                            <span className="stat-value">{commit.stats.additions.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {commit.stats.deletions !== undefined && (
                                        <div className="commit-stat commit-stat--del">
                                            <span className="stat-icon">−</span>
                                            <span className="stat-value">{commit.stats.deletions.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {commit.stats.additions !== undefined && commit.stats.deletions !== undefined && (
                                        <div className="stat-net">
                                            Net: <span className={commit.stats.additions >= commit.stats.deletions ? 'net-positive' : 'net-negative'}>
                                                    {(commit.stats.additions - commit.stats.deletions).toLocaleString()}
                                                </span>
                                        </div>
                                    )}
                                </dd>
                            </div>
                        )}

                        {commit.branchHints && commit.branchHints.length > 0 && (
                            <div className="commit-details__row">
                                <dt>Branch{commit.branchHints.length > 1 ? 'es' : ''}</dt>
                                <dd className="commit-branches">
                                    {commit.branchHints.map((branchName: string) => (
                                        <span key={branchName} className="commit-tag commit-tag--branch">
                                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M4 9h8M12 9l-4 4"/>
                                            </svg>
                                            {branchName}
                                        </span>
                                    ))}
                                </dd>
                            </div>
                        )}
                    </dl>
                </div>

                <div className="commit-dialog__actions">
                    <button
                        type="button"
                        className="commit-dialog__action-btn"
                        onClick={handleCopySha}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 13l4 4H19"/>
                            <path d="M12 5V3"/>
                            <rect x="3" y="7" width="18" height="11" rx="2" ry="2"/>
                        </svg>
                        {copiedCommitId === commit.id ? 'Copied' : 'Copy SHA'}
                    </button>
                    <button
                        type="button"
                        className="commit-dialog__action-btn primary"
                        onClick={toggleDetails}
                    >
                        Done
                    </button>
                </div>
            </div>

            <style>{`
        .commit-dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          max-width: 540px;
          width: 90%;
          margin: 0;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          background: rgba(var(--rp-surface-rgb), 0.95);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          color: var(--rp-text);
          box-shadow:
            0 0 60px rgba(156, 207, 216, 0.15),
            0 30px 60px rgba(196, 167, 231, 0.1),
            0 0 0 1px rgba(0, 0, 0, 0.3);
          z-index: 1000;
        }

        .commit-dialog__backdrop {
          position: fixed;
          inset: 0;
          background: rgba(var(--rp-base-rgb), 0.8);
          backdrop-filter: blur(8px);
          z-index: 999;
        }

        .commit-dialog__content {
          padding: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 20px;
        }

        .commit-dialog__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          padding: 2rem 2rem 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .commit-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .commit-icon svg {
          width: 24px;
          height: 24px;
          stroke: #fff;
        }

        .commit-dialog__title {
          margin: 0;
          flex: 1;
          min-width: 0;
          font-size: 1.25rem;
          font-weight: 700;
          line-height: 1.4;
          word-break: break-word;
          color: var(--rp-text);
        }

        .commit-dialog__close {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--rp-subtle);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .commit-dialog__close:hover {
          background: rgba(235, 111, 146, 0.15);
          color: var(--rp-love);
          transform: rotate(90deg) scale(1.05);
          border-color: rgba(235, 111, 146, 0.3);
        }

        .commit-dialog__body {
          padding: 2rem;
          overflow-y: auto;
          max-height: 60vh;
        }

        .commit-details {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .commit-details__row {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 1rem;
          align-items: start;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.01);
          border-radius: 10px;
          transition: background 0.2s ease;
        }

        .commit-details__row:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .commit-details dt {
          font-size: 0.8rem;
          color: var(--rp-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding-top: 0.25rem;
        }

        .commit-details dd {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.6;
        }

        .commit-sha code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          background: rgba(156, 207, 216, 0.1);
          border: 1px solid rgba(156, 207, 216, 0.2);
          border-radius: 6px;
          padding: 0.3em 0.6em;
          color: var(--rp-foam);
          overflow-wrap: anywhere;
        }

        .sha-full {
          color: var(--rp-foam);
        }

        .commit-author {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .author-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .commit-date {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .date-full {
          color: var(--rp-text);
          font-weight: 500;
        }

        .commit-parents {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: center;
        }

        .parent-sha {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          background: rgba(196, 167, 231, 0.1);
          border: 1px solid rgba(196, 167, 231, 0.2);
          border-radius: 6px;
          padding: 0.25em 0.5em;
          color: var(--rp-iris);
          transition: all 0.2s ease;
          overflow-wrap: anywhere;
        }

        .parent-sha:hover {
          background: rgba(196, 167, 231, 0.15);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(196, 167, 231, 0.2);
        }

        .commit-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .commit-tag:hover {
          transform: translateY(-2px);
        }

        .commit-tag svg {
          width: 14px;
          height: 14px;
        }

        .commit-tag--root {
          background: linear-gradient(135deg, rgba(49, 116, 143, 0.9), rgba(49, 116, 143, 0.7));
          color: #fff;
          border: 1px solid rgba(49, 116, 143, 0.3);
        }

        .commit-tag--merge {
          background: linear-gradient(135deg, rgba(196, 167, 231, 0.9), rgba(196, 167, 231, 0.7));
          color: #fff;
          border: 1px solid rgba(196, 167, 231, 0.3);
        }

        .commit-tag--branch {
          background: rgba(156, 207, 216, 0.1);
          color: var(--rp-foam);
          border: 1px solid rgba(156, 207, 216, 0.2);
        }

        .commit-stats-row {
          background: rgba(255, 255, 255, 0.02);
        }

        .commit-stats {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .commit-stat {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.95rem;
          font-weight: 600;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.2s ease;
        }

        .commit-stat:hover {
          background: rgba(255, 255, 255, 0.06);
          transform: translateY(-2px);
        }

        .stat-icon {
          font-size: 1.1rem;
          opacity: 0.8;
        }

        .stat-value {
          font-size: 0.95rem;
        }

        .commit-stat--add {
          color: var(--rp-foam);
          border-color: rgba(156, 207, 216, 0.2);
        }

        .commit-stat--del {
          color: var(--rp-love);
          border-color: rgba(235, 111, 146, 0.2);
        }

        .stat-net {
          font-size: 0.85rem;
          font-weight: 500;
          margin-left: 0.5rem;
        }

        .net-positive {
          color: var(--rp-foam);
        }

        .net-negative {
          color: var(--rp-love);
        }

        .commit-branches {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }

        .commit-dialog__actions {
          display: flex;
          gap: 0.75rem;
          padding: 1.5rem 2rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .commit-dialog__action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.03);
          color: var(--rp-subtle);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
        }

        .commit-dialog__action-btn svg {
          width: 18px;
          height: 18px;
        }

        .commit-dialog__action-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--rp-text);
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .commit-dialog__action-btn.primary {
          background: linear-gradient(135deg, var(--rp-foam), var(--rp-iris));
          color: var(--rp-base);
          font-weight: 600;
          border: none;
        }

        .commit-dialog__action-btn.primary:hover {
          background: linear-gradient(135deg, rgba(156, 207, 216, 0.9), rgba(196, 167, 231, 0.9));
          box-shadow: 0 8px 25px rgba(156, 207, 216, 0.3);
        }

        @media (max-width: 600px) {
          .commit-dialog {
            width: 95%;
            max-width: none;
            border-radius: 16px;
          }

          .commit-details__row {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .commit-details dt {
            padding-top: 0;
          }

          .commit-dialog__header {
            padding: 1.5rem;
          }

          .commit-dialog__body {
            padding: 1.5rem;
          }
        }
      `}</style>
        </dialog>
    );
}
