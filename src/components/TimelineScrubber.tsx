import { useCallback, useMemo } from 'react';
import { useGraphStore } from '@lib/store/graph-store';

export function TimelineScrubber() {
    const { nodes, selectedId, selectCommit } = useGraphStore();

    const { minTime, maxTime } = useMemo(() => {
        if (nodes.length === 0) {
            return { minTime: 0, maxTime: 0 };
        }
        let min = Infinity;
        let max = -Infinity;
        for (const node of nodes) {
            const time = node.commit.authoredAt;
            if (time < min) min = time;
            if (time > max) max = time;
        }
        return { minTime: min, maxTime: max };
    }, [nodes]);

    const timeRange = maxTime - minTime || 1;

    const nodesByTime = useMemo(
        () => (nodes.length > 0 ? [...nodes].sort((a, b) => a.commit.authoredAt - b.commit.authoredAt) : []),
        [nodes]
    );

    const selectedNode = nodes.find(n => n.id === selectedId);
    const currentTime = selectedNode?.commit.authoredAt ?? maxTime;
    const currentProgress = ((currentTime - minTime) / timeRange) * 100;

    const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (nodesByTime.length === 0) return;
        const progress = parseFloat(e.target.value);
        const targetTime = minTime + (progress / 100) * timeRange;

        let low = 0;
        let high = nodesByTime.length - 1;
        let best = nodesByTime[0];

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const node = nodesByTime[mid];
            const time = node.commit.authoredAt;

            if (Math.abs(time - targetTime) < Math.abs(best.commit.authoredAt - targetTime)) {
                best = node;
            }

            if (time < targetTime) {
                low = mid + 1;
            } else if (time > targetTime) {
                high = mid - 1;
            } else {
                best = node;
                break;
            }
        }

        selectCommit(best.id);
    }, [minTime, timeRange, nodesByTime, selectCommit]);

    const formatTime = useCallback((timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }, []);

    if (nodes.length === 0) return null;

    return (
        <div className="timeline-scrubber">
            <div className="timeline-info">
                <span className="timeline-time">{formatTime(currentTime)}</span>
                <span className="timeline-progress">
                    {Math.round(currentProgress)}%
                </span>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={currentProgress}
                onChange={handleScrub}
                className="timeline-slider"
                aria-label="Timeline scrubber"
            />
            <div className="timeline-labels">
                <span>{formatTime(minTime)}</span>
                <span>{formatTime(maxTime)}</span>
            </div>
        </div>
    );
}
