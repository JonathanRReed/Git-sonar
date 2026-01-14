import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import { getRelativeTime } from '@lib/utils/formatting';

const ITEM_HEIGHT = 64; // Height of each commit item in pixels
const OVERSCAN = 5; // Number of items to render outside viewport

interface CommitListProps {
    searchQuery?: string;
}

export function VirtualCommitList({ searchQuery = '' }: CommitListProps) {
    const { nodes, selectedId, selectCommit } = useGraphStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    // Reverse nodes to show newest first
    const reversedNodes = useMemo(() => [...nodes].reverse(), [nodes]);

    // Fuzzy match scoring (lower is better)
    const fuzzyScore = useCallback((query: string, text: string): number | null => {
        const q = query.toLowerCase();
        const t = text.toLowerCase();

        if (t.includes(q)) return 0;

        // Subsequence match scoring
        let qi = 0;
        let score = 0;
        let lastMatch = -1;

        for (let ti = 0; ti < t.length && qi < q.length; ti++) {
            if (t[ti] === q[qi]) {
                if (lastMatch >= 0) {
                    score += ti - lastMatch - 1;
                } else {
                    score += ti; // penalize starting later
                }
                lastMatch = ti;
                qi++;
            }
        }

        return qi === q.length ? score : null;
    }, []);

    // Filter nodes based on fuzzy search query
    const filteredNodes = useMemo(() => {
        const query = searchQuery.trim();
        if (!query) return reversedNodes;

        const scored = reversedNodes
            .map((node) => {
                const scores = [
                    fuzzyScore(query, node.commit.messageSubject),
                    fuzzyScore(query, node.commit.authorName),
                    fuzzyScore(query, node.id),
                ].filter((score): score is number => score !== null);

                if (scores.length === 0) return null;
                return { node, score: Math.min(...scores) };
            })
            .filter((item): item is { node: typeof reversedNodes[number]; score: number } => item !== null)
            .sort((a, b) => a.score - b.score);

        return scored.map((item) => item.node);
    }, [reversedNodes, searchQuery, fuzzyScore]);

    // Calculate visible range
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(
        filteredNodes.length,
        Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
    );
    const visibleNodes = filteredNodes.slice(startIndex, endIndex);

    // Total height of all items
    const totalHeight = filteredNodes.length * ITEM_HEIGHT;

    // Handle scroll events
    const handleScroll = useCallback(() => {
        if (containerRef.current) {
            setScrollTop(containerRef.current.scrollTop);
        }
    }, []);

    // Set up resize observer
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });

        resizeObserver.observe(container);
        setContainerHeight(container.clientHeight);

        return () => resizeObserver.disconnect();
    }, []);

    // Scroll to selected commit when it changes
    useEffect(() => {
        if (!selectedId || !containerRef.current) return;

        const index = filteredNodes.findIndex(n => n.id === selectedId);
        if (index === -1) return;

        const itemTop = index * ITEM_HEIGHT;
        const itemBottom = itemTop + ITEM_HEIGHT;
        const viewTop = containerRef.current.scrollTop;
        const viewBottom = viewTop + containerHeight;

        // Scroll into view if not visible
        if (itemTop < viewTop) {
            containerRef.current.scrollTop = itemTop;
        } else if (itemBottom > viewBottom) {
            containerRef.current.scrollTop = itemBottom - containerHeight;
        }
    }, [selectedId, filteredNodes, containerHeight]);

    const activeDescendant = selectedId ? `commit-option-${selectedId}` : undefined;

    return (
        <div
            ref={containerRef}
            className="virtual-commit-list"
            onScroll={handleScroll}
            id="commit-list"
            role="listbox"
            aria-label="Commit list"
            aria-activedescendant={activeDescendant}
        >
            <div 
                className="virtual-commit-list__spacer"
                style={{ height: totalHeight }}
            >
                <div 
                    className="virtual-commit-list__items"
                    style={{ transform: `translateY(${startIndex * ITEM_HEIGHT}px)` }}
                >
                    {visibleNodes.map((node) => {
                        const isSelected = node.id === selectedId;
                        const isMerge = node.commit.parents.length > 1;

                        return (
                            <div
                                key={node.id}
                                id={`commit-option-${node.id}`}
                                className={`commit-item ${isSelected ? 'commit-item--selected' : ''}`}
                                onClick={() => selectCommit(node.id)}
                                style={{ height: ITEM_HEIGHT }}
                                role="option"
                                tabIndex={isSelected ? 0 : -1}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        selectCommit(node.id);
                                    }
                                }}
                                aria-selected={isSelected}
                                aria-label={`${node.commit.messageSubject} by ${node.commit.authorName}`}
                            >
                                <div className={`commit-item__dot ${isMerge ? 'commit-item__dot--merge' : ''}`} />
                                <div className="commit-item__content">
                                    <div className="commit-item__message">
                                        {node.commit.messageSubject.slice(0, 60)}
                                        {node.commit.messageSubject.length > 60 ? '...' : ''}
                                    </div>
                                    <div className="commit-item__meta">
                                        <span className="commit-item__sha">{node.id.slice(0, 7)}</span>
                                        <span className="commit-item__author">{node.commit.authorName}</span>
                                        <span className="commit-item__time">{getRelativeTime(node.commit.authoredAt)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {filteredNodes.length === 0 && searchQuery && (
                <div className="commit-list__empty">
                    No commits match “{searchQuery}”
                </div>
            )}

            <style>{`
                .virtual-commit-list {
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                }

                .virtual-commit-list__spacer {
                    position: relative;
                }

                .virtual-commit-list__items {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                }

                .commit-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                    padding: 0.6rem 0.75rem;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background 0.1s ease;
                    box-sizing: border-box;
                }

                .commit-item:hover {
                    background: var(--rp-overlay);
                }

                .commit-item:focus-visible {
                    outline: 2px solid var(--rp-foam);
                    outline-offset: -2px;
                }

                .commit-item--selected {
                    background: var(--rp-highlight-low);
                }

                .commit-item__dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: var(--rp-foam);
                    margin-top: 0.25rem;
                    flex-shrink: 0;
                }

                .commit-item__dot--merge {
                    background: var(--rp-iris);
                    border-radius: 2px;
                }

                .commit-item__content {
                    flex: 1;
                    min-width: 0;
                }

                .commit-item__message {
                    font-size: 0.85rem;
                    color: var(--rp-text);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-bottom: 0.25rem;
                }

                .commit-item__meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    row-gap: 0.2rem;
                    font-size: 0.75rem;
                    color: var(--rp-muted);
                    min-width: 0;
                }

                .commit-item__sha {
                    font-family: 'JetBrains Mono', monospace;
                    color: var(--rp-subtle);
                    white-space: nowrap;
                }

                .commit-item__author {
                    min-width: 0;
                    max-width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .commit-item__time {
                    white-space: nowrap;
                }

                .commit-list__empty {
                    padding: 2rem 1rem;
                    text-align: center;
                    color: var(--rp-muted);
                    font-size: 0.9rem;
                }
            `}</style>
        </div>
    );
}
