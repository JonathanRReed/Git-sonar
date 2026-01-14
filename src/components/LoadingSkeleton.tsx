interface LoadingSkeletonProps {
    className?: string;
}

export function LoadingSkeleton({ className = '' }: LoadingSkeletonProps) {
    return (
        <div className={`skeleton ${className}`} />
    );
}

export function CommitListSkeleton({ count = 8 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="commit-item skeleton-item">
                    <div className="commit-item__dot skeleton-dot" />
                    <div className="commit-item__content skeleton-content">
                        <div className="commit-item__message skeleton-message" />
                        <div className="commit-item__meta skeleton-meta" />
                    </div>
                </div>
            ))}
        </>
    );
}

export function StatsSkeleton() {
    return (
        <>
            <div className="stat">
                <span className="stat__value skeleton-value">000</span>
                <span className="stat__label skeleton-label">commits</span>
            </div>
            <div className="stat">
                <span className="stat__value skeleton-value">00</span>
                <span className="stat__label skeleton-label">authors</span>
            </div>
            <div className="stat">
                <span className="stat__value skeleton-value">00</span>
                <span className="stat__label skeleton-label">merges</span>
            </div>
        </>
    );
}

export function GraphSkeleton() {
    return (
        <div className="graph-skeleton">
            <div className="graph-skeleton__lane lane-1">
                <div className="skeleton-node" />
                <div className="skeleton-node" />
                <div className="skeleton-node" />
                <div className="skeleton-node skeleton-node--merge" />
                <div className="skeleton-node" />
            </div>
            <div className="graph-skeleton__lane lane-2">
                <div className="skeleton-edge skeleton-edge--diagonal" />
                <div className="skeleton-node" />
                <div className="skeleton-node" />
                <div className="skeleton-edge skeleton-edge--diagonal" />
            </div>
            <div className="graph-skeleton__lane lane-3">
                <div className="skeleton-edge skeleton-edge--diagonal" />
                <div className="skeleton-node" />
                <div className="skeleton-node" />
            </div>
        </div>
    );
}
