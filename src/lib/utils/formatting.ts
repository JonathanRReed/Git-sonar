export function getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (diff < minute) return 'just now';
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    if (diff < week) return `${Math.floor(diff / day)}d ago`;
    if (diff < month) return `${Math.floor(diff / week)}w ago`;
    if (diff < year) return `${Math.floor(diff / month)}mo ago`;
    return `${Math.floor(diff / year)}y ago`;
}

export function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

export function formatTimelineDate(timestamp: number, timeSpan: number): string {
    const date = new Date(timestamp);
    const day = 24 * 60 * 60 * 1000;
    const month = 30 * day;
    const year = 365 * day;

    if (timeSpan <= month * 1.5) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    if (timeSpan <= year * 1.5) {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    return date.toLocaleDateString('en-US', { year: 'numeric' });
}

export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

export function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}
