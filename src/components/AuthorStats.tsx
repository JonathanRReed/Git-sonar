import { useMemo, useState } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import { hexToRgba } from '@lib/utils/color';
import { ChevronDown, ChevronUp, Users, TrendingUp } from 'lucide-react';

interface AuthorStat {
    name: string;
    email: string;
    count: number;
    percentage: number;
    firstCommit: number;
    lastCommit: number;
    avatarUrl: string | null;
}

function getGravatarUrl(emailHash: string | undefined): string {
    // Use the pre-computed MD5 hash if available, otherwise use identicon
    if (emailHash) {
        return `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=40`;
    }
    return `https://www.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&s=40`;
}

export function AuthorStats() {
    const { nodes, theme, viewMode } = useGraphStore();
    const [isExpanded, setIsExpanded] = useState(true);
    const [sortBy, setSortBy] = useState<'commits' | 'recent'>('commits');

    const authorStats = useMemo(() => {
        if (nodes.length === 0) return [];

        const statsMap = new Map<string, AuthorStat>();

        for (const node of nodes) {
            const { authorName, authorEmailHash, authoredAt } = node.commit;
            // Use author name as key since we don't have raw email
            const key = authorName.toLowerCase();

            if (statsMap.has(key)) {
                const stat = statsMap.get(key)!;
                stat.count++;
                stat.firstCommit = Math.min(stat.firstCommit, authoredAt);
                stat.lastCommit = Math.max(stat.lastCommit, authoredAt);
            } else {
                statsMap.set(key, {
                    name: authorName,
                    email: key,
                    count: 1,
                    percentage: 0,
                    firstCommit: authoredAt,
                    lastCommit: authoredAt,
                    avatarUrl: getGravatarUrl(authorEmailHash),
                });
            }
        }

        const total = nodes.length;
        const stats = Array.from(statsMap.values()).map(stat => ({
            ...stat,
            percentage: (stat.count / total) * 100,
        }));

        if (sortBy === 'commits') {
            stats.sort((a, b) => b.count - a.count);
        } else {
            stats.sort((a, b) => b.lastCommit - a.lastCommit);
        }

        return stats.slice(0, 10); // Top 10 contributors
    }, [nodes, sortBy]);

    const totalAuthors = useMemo(() => {
        const names = new Set(nodes.map(n => n.commit.authorName.toLowerCase()));
        return names.size;
    }, [nodes]);

    if (viewMode === 'poster' || nodes.length === 0) return null;

    const colors = theme.colors;

    return (
        <div className="author-stats">
            <button
                className="author-stats__header"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
            >
                <div className="author-stats__title">
                    <Users size={16} />
                    <span>Contributors</span>
                    <span className="author-stats__count">{totalAuthors}</span>
                </div>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isExpanded && (
                <div className="author-stats__content">
                    <div className="author-stats__sort">
                        <button
                            className={`sort-btn ${sortBy === 'commits' ? 'sort-btn--active' : ''}`}
                            onClick={() => setSortBy('commits')}
                        >
                            <TrendingUp size={12} />
                            Most Commits
                        </button>
                        <button
                            className={`sort-btn ${sortBy === 'recent' ? 'sort-btn--active' : ''}`}
                            onClick={() => setSortBy('recent')}
                        >
                            Recent
                        </button>
                    </div>

                    <div className="author-stats__list">
                        {authorStats.map((stat, index) => (
                            <div key={stat.email} className="author-item">
                                <div className="author-item__rank">{index + 1}</div>
                                <img
                                    src={stat.avatarUrl || ''}
                                    alt=""
                                    className="author-item__avatar"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                <div className="author-item__info">
                                    <div className="author-item__name">{stat.name}</div>
                                    <div className="author-item__meta">
                                        {stat.count} commit{stat.count !== 1 ? 's' : ''}
                                    </div>
                                </div>
                                <div className="author-item__bar">
                                    <div
                                        className="author-item__bar-fill"
                                        style={{
                                            width: `${stat.percentage}%`,
                                            background: index === 0
                                                ? colors.foam
                                                : index === 1
                                                    ? colors.iris
                                                    : colors.gold,
                                        }}
                                    />
                                </div>
                                <div className="author-item__percent">
                                    {stat.percentage.toFixed(1)}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .author-stats {
                    border-top: 1px solid var(--rp-highlight-low);
                    background: var(--rp-surface);
                }

                .author-stats__header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    padding: 0.75rem 1rem;
                    background: transparent;
                    border: none;
                    color: var(--rp-text);
                    cursor: pointer;
                    transition: background 0.15s;
                }

                .author-stats__header:hover {
                    background: var(--rp-overlay);
                }

                .author-stats__title {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--rp-subtle);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .author-stats__count {
                    padding: 0.15rem 0.5rem;
                    background: var(--rp-overlay);
                    border-radius: 999px;
                    font-size: 0.7rem;
                    color: var(--rp-foam);
                }

                .author-stats__content {
                    padding: 0 1rem 1rem;
                }

                .author-stats__sort {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                }

                .sort-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.35rem 0.6rem;
                    border: 1px solid var(--rp-highlight-med);
                    border-radius: 6px;
                    background: transparent;
                    color: var(--rp-subtle);
                    font-size: 0.7rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .sort-btn:hover {
                    border-color: var(--rp-foam);
                    color: var(--rp-text);
                }

                .sort-btn--active {
                    background: rgba(156, 207, 216, 0.15);
                    border-color: var(--rp-foam);
                    color: var(--rp-foam);
                }

                .author-stats__list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .author-item {
                    display: grid;
                    grid-template-columns: 1.25rem 1.75rem 1fr 3rem 2.5rem;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem;
                    background: var(--rp-overlay);
                    border-radius: 8px;
                    transition: background 0.15s;
                }

                .author-item:hover {
                    background: ${hexToRgba(colors.foam, 0.1)};
                }

                .author-item__rank {
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: var(--rp-muted);
                    text-align: center;
                }

                .author-item__avatar {
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    background: var(--rp-highlight-med);
                }

                .author-item__info {
                    min-width: 0;
                }

                .author-item__name {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: var(--rp-text);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .author-item__meta {
                    font-size: 0.7rem;
                    color: var(--rp-muted);
                }

                .author-item__bar {
                    height: 4px;
                    background: var(--rp-highlight-low);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .author-item__bar-fill {
                    height: 100%;
                    border-radius: 2px;
                    transition: width 0.3s ease;
                }

                .author-item__percent {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--rp-subtle);
                    text-align: right;
                    font-family: 'JetBrains Mono', monospace;
                }
            `}</style>
        </div>
    );
}
