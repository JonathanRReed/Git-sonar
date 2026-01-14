import { useEffect, useRef } from 'react';
import { useGraphStore } from '@lib/store/graph-store';

/**
 * Hidden live region for screen reader announcements.
 * Announces commit selection changes.
 */
export function LiveRegion() {
    const { selectedId, graph } = useGraphStore();
    const prevIdRef = useRef<string | null>(null);
    const regionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Only announce if selection changed
        if (selectedId === prevIdRef.current) return;
        prevIdRef.current = selectedId;

        if (!selectedId || !graph || !regionRef.current) return;

        const commit = graph.commits.get(selectedId);
        if (!commit) return;

        // Build announcement
        const lane = graph.lanes.get(selectedId) ?? 0;
        const parentCount = commit.parents.length;
        const relativeTime = getRelativeTime(commit.authoredAt);
        const branch = commit.branchHints?.[0] ?? `lane ${lane + 1}`;

        let announcement = `Commit ${selectedId.slice(0, 7)}`;

        if (parentCount === 0) {
            announcement += ', root commit';
        } else if (parentCount > 1) {
            announcement += `, merge with ${parentCount} parents`;
        }

        announcement += `, by ${commit.authorName}`;
        announcement += `, ${relativeTime}`;
        announcement += `, ${branch}`;
        announcement += `. ${commit.messageSubject}`;

        // Update live region
        regionRef.current.textContent = announcement;
    }, [selectedId, graph]);

    return (
        <div
            ref={regionRef}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
        />
    );
}

function getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (diff < minute) return 'just now';
    if (diff < hour) return `${Math.floor(diff / minute)} minutes ago`;
    if (diff < day) return `${Math.floor(diff / hour)} hours ago`;
    if (diff < week) return `${Math.floor(diff / day)} days ago`;
    if (diff < month) return `${Math.floor(diff / week)} weeks ago`;
    if (diff < year) return `${Math.floor(diff / month)} months ago`;
    return `${Math.floor(diff / year)} years ago`;
}
