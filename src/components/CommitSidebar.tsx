import { useState, useCallback } from 'react';
import { VirtualCommitList } from './VirtualCommitList';
import { AuthorStats } from './AuthorStats';
import { CommitFilters } from './CommitFilters';

export interface FilterState {
    authorFilter: string | null;
    dateRange: { start: number | null; end: number | null };
    branchFilter: string | null;
}

export function CommitSidebar() {
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState<FilterState>({
        authorFilter: null,
        dateRange: { start: null, end: null },
        branchFilter: null,
    });
    const [showFilters, setShowFilters] = useState(false);

    const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    }, []);

    const hasActiveFilters = filters.authorFilter !== null || 
        filters.dateRange.start !== null || 
        filters.dateRange.end !== null ||
        filters.branchFilter !== null;

    const clearFilters = useCallback(() => {
        setFilters({
            authorFilter: null,
            dateRange: { start: null, end: null },
            branchFilter: null,
        });
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
                <div className="filter-controls">
                    <button
                        type="button"
                        className={`filter-toggle ${showFilters ? 'filter-toggle--active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                        aria-expanded={showFilters}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
                        </svg>
                        Filters
                        {hasActiveFilters && <span className="filter-badge" />}
                    </button>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            className="filter-clear"
                            onClick={clearFilters}
                            aria-label="Clear all filters"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
            
            {showFilters && (
                <CommitFilters filters={filters} onFiltersChange={setFilters} />
            )}
            
            <VirtualCommitList searchQuery={searchQuery} filters={filters} />
            <AuthorStats />

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

                .filter-controls {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-top: 0.75rem;
                }

                .filter-toggle {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.4rem 0.6rem;
                    border: 1px solid var(--rp-highlight-med);
                    border-radius: 6px;
                    background: transparent;
                    color: var(--rp-subtle);
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .filter-toggle svg {
                    width: 14px;
                    height: 14px;
                }

                .filter-toggle:hover {
                    border-color: var(--rp-foam);
                    color: var(--rp-text);
                }

                .filter-toggle--active {
                    background: rgba(156, 207, 216, 0.15);
                    border-color: var(--rp-foam);
                    color: var(--rp-foam);
                }

                .filter-badge {
                    width: 6px;
                    height: 6px;
                    background: var(--rp-love);
                    border-radius: 50%;
                    margin-left: 0.25rem;
                }

                .filter-clear {
                    padding: 0.35rem 0.5rem;
                    border: none;
                    border-radius: 4px;
                    background: rgba(235, 111, 146, 0.15);
                    color: var(--rp-love);
                    font-size: 0.7rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .filter-clear:hover {
                    background: rgba(235, 111, 146, 0.25);
                }
            `}</style>
        </>
    );
}
