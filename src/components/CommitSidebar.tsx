import { useState, useCallback } from 'react';
import { VirtualCommitList } from './VirtualCommitList';

export function CommitSidebar() {
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    }, []);

    return (
        <>
            <div className="sidebar__header">
                <h2>Commits</h2>
                <div className="search-container">
                    <input
                        type="search"
                        placeholder="Search commits..."
                        className="search-input"
                        id="search-input"
                        aria-label="Search commits (press / to focus)"
                        aria-controls="commit-list"
                        aria-describedby="search-hint"
                        value={searchQuery}
                        onChange={handleSearch}
                    />
                    <kbd className="search-kbd" id="search-hint" title="Press / to focus search">/</kbd>
                </div>
            </div>
            <VirtualCommitList searchQuery={searchQuery} />

            <style>{`
                .sidebar__header {
                    padding: 1rem;
                    border-bottom: 1px solid var(--rp-highlight-low);
                }

                .sidebar__header h2 {
                    margin: 0 0 0.75rem;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--rp-subtle);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .search-container {
                    position: relative;
                }

                .search-input {
                    width: 100%;
                    padding: 0.5rem 2.5rem 0.5rem 0.75rem;
                    background: var(--rp-overlay);
                    border: 1px solid var(--rp-highlight-med);
                    border-radius: 6px;
                    color: var(--rp-text);
                    font-size: 0.85rem;
                }

                .search-input::placeholder {
                    color: var(--rp-muted);
                }

                .search-input:focus {
                    outline: none;
                    border-color: var(--rp-foam);
                }

                .search-input:focus + .search-kbd {
                    opacity: 0;
                }

                .search-kbd {
                    position: absolute;
                    right: 0.5rem;
                    top: 50%;
                    transform: translateY(-50%);
                    padding: 0.15rem 0.4rem;
                    background: var(--rp-surface);
                    border: 1px solid var(--rp-highlight-med);
                    border-radius: 4px;
                    color: var(--rp-muted);
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.7rem;
                    font-weight: 600;
                    pointer-events: none;
                    transition: opacity 0.15s ease;
                }
            `}</style>
        </>
    );
}
