import { useMemo, useState } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import { Calendar, User, GitBranch, ChevronDown } from 'lucide-react';
import type { FilterState } from './CommitSidebar';

interface CommitFiltersProps {
    filters: FilterState;
    onFiltersChange: (filters: FilterState) => void;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function CommitFilters({ filters, onFiltersChange }: CommitFiltersProps) {
    const { nodes, graph, theme } = useGraphStore();
    const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
    const [showBranchDropdown, setShowBranchDropdown] = useState(false);

    const authors = useMemo(() => {
        const authorMap = new Map<string, { name: string; count: number }>();
        for (const node of nodes) {
            const name = node.commit.authorName;
            const key = name.toLowerCase();
            if (authorMap.has(key)) {
                authorMap.get(key)!.count++;
            } else {
                authorMap.set(key, { name, count: 1 });
            }
        }
        return Array.from(authorMap.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);
    }, [nodes]);

    const branches = useMemo(() => {
        if (!graph) return [];
        return Array.from(graph.heads.keys()).sort();
    }, [graph]);

    const dateRange = useMemo(() => {
        if (nodes.length === 0) return { min: 0, max: 0 };
        const times = nodes.map(n => n.commit.authoredAt).filter(Number.isFinite);
        return {
            min: Math.min(...times),
            max: Math.max(...times),
        };
    }, [nodes]);

    const handleAuthorSelect = (author: string | null) => {
        onFiltersChange({ ...filters, authorFilter: author });
        setShowAuthorDropdown(false);
    };

    const handleBranchSelect = (branch: string | null) => {
        onFiltersChange({ ...filters, branchFilter: branch });
        setShowBranchDropdown(false);
    };

    const handleDateRangeChange = (type: 'start' | 'end', value: string) => {
        const timestamp = value ? new Date(value).getTime() : null;
        onFiltersChange({
            ...filters,
            dateRange: {
                ...filters.dateRange,
                [type]: timestamp,
            },
        });
    };

    return (
        <div className="commit-filters">
            {/* Author Filter */}
            <div className="filter-group">
                <label className="filter-label">
                    <User size={12} />
                    Author
                </label>
                <div className="filter-dropdown">
                    <button
                        type="button"
                        className="filter-dropdown__trigger"
                        onClick={() => setShowAuthorDropdown(!showAuthorDropdown)}
                        aria-expanded={showAuthorDropdown}
                    >
                        <span>{filters.authorFilter || 'All authors'}</span>
                        <ChevronDown size={14} />
                    </button>
                    {showAuthorDropdown && (
                        <div className="filter-dropdown__menu">
                            <button
                                type="button"
                                className={`filter-dropdown__item ${!filters.authorFilter ? 'filter-dropdown__item--active' : ''}`}
                                onClick={() => handleAuthorSelect(null)}
                            >
                                All authors
                            </button>
                            {authors.map(author => (
                                <button
                                    key={author.name}
                                    type="button"
                                    className={`filter-dropdown__item ${filters.authorFilter === author.name ? 'filter-dropdown__item--active' : ''}`}
                                    onClick={() => handleAuthorSelect(author.name)}
                                >
                                    <span>{author.name}</span>
                                    <span className="filter-dropdown__count">{author.count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Branch Filter */}
            <div className="filter-group">
                <label className="filter-label">
                    <GitBranch size={12} />
                    Branch
                </label>
                <div className="filter-dropdown">
                    <button
                        type="button"
                        className="filter-dropdown__trigger"
                        onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                        aria-expanded={showBranchDropdown}
                    >
                        <span>{filters.branchFilter || 'All branches'}</span>
                        <ChevronDown size={14} />
                    </button>
                    {showBranchDropdown && (
                        <div className="filter-dropdown__menu">
                            <button
                                type="button"
                                className={`filter-dropdown__item ${!filters.branchFilter ? 'filter-dropdown__item--active' : ''}`}
                                onClick={() => handleBranchSelect(null)}
                            >
                                All branches
                            </button>
                            {branches.map(branch => (
                                <button
                                    key={branch}
                                    type="button"
                                    className={`filter-dropdown__item ${filters.branchFilter === branch ? 'filter-dropdown__item--active' : ''}`}
                                    onClick={() => handleBranchSelect(branch)}
                                >
                                    {branch}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="filter-group filter-group--date">
                <label className="filter-label">
                    <Calendar size={12} />
                    Date range
                </label>
                <div className="filter-date-inputs">
                    <input
                        type="date"
                        className="filter-date-input"
                        value={filters.dateRange.start ? new Date(filters.dateRange.start).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleDateRangeChange('start', e.target.value)}
                        min={dateRange.min ? new Date(dateRange.min).toISOString().split('T')[0] : undefined}
                        max={dateRange.max ? new Date(dateRange.max).toISOString().split('T')[0] : undefined}
                        aria-label="Start date"
                    />
                    <span className="filter-date-separator">to</span>
                    <input
                        type="date"
                        className="filter-date-input"
                        value={filters.dateRange.end ? new Date(filters.dateRange.end).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleDateRangeChange('end', e.target.value)}
                        min={dateRange.min ? new Date(dateRange.min).toISOString().split('T')[0] : undefined}
                        max={dateRange.max ? new Date(dateRange.max).toISOString().split('T')[0] : undefined}
                        aria-label="End date"
                    />
                </div>
            </div>

            <style>{`
                .commit-filters {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    padding: 0.75rem 1rem;
                    background: var(--rp-overlay);
                    border-bottom: 1px solid var(--rp-highlight-low);
                    animation: slideDown 0.2s ease;
                }

                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.35rem;
                }

                .filter-label {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--rp-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .filter-dropdown {
                    position: relative;
                }

                .filter-dropdown__trigger {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    padding: 0.45rem 0.6rem;
                    border: 1px solid var(--rp-highlight-med);
                    border-radius: 6px;
                    background: var(--rp-surface);
                    color: var(--rp-text);
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .filter-dropdown__trigger:hover {
                    border-color: var(--rp-foam);
                }

                .filter-dropdown__menu {
                    position: absolute;
                    top: calc(100% + 4px);
                    left: 0;
                    right: 0;
                    max-height: 200px;
                    overflow-y: auto;
                    background: var(--rp-surface);
                    border: 1px solid var(--rp-highlight-med);
                    border-radius: 6px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
                    z-index: 50;
                }

                .filter-dropdown__item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    padding: 0.5rem 0.6rem;
                    border: none;
                    background: transparent;
                    color: var(--rp-text);
                    font-size: 0.8rem;
                    text-align: left;
                    cursor: pointer;
                    transition: background 0.1s;
                }

                .filter-dropdown__item:hover {
                    background: var(--rp-overlay);
                }

                .filter-dropdown__item--active {
                    background: rgba(156, 207, 216, 0.15);
                    color: var(--rp-foam);
                }

                .filter-dropdown__count {
                    font-size: 0.7rem;
                    color: var(--rp-muted);
                    font-family: 'JetBrains Mono', monospace;
                }

                .filter-date-inputs {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .filter-date-input {
                    flex: 1;
                    padding: 0.4rem 0.5rem;
                    border: 1px solid var(--rp-highlight-med);
                    border-radius: 6px;
                    background: var(--rp-surface);
                    color: var(--rp-text);
                    font-size: 0.75rem;
                    font-family: inherit;
                }

                .filter-date-input:focus {
                    outline: none;
                    border-color: var(--rp-foam);
                }

                .filter-date-separator {
                    font-size: 0.75rem;
                    color: var(--rp-muted);
                }
            `}</style>
        </div>
    );
}
