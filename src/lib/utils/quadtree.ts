/**
 * Quadtree for spatial indexing of graph nodes.
 * Provides O(log n) queries for viewport culling and hit testing.
 */

export interface Point {
    x: number;
    y: number;
}

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SpatialItem<T> {
    x: number;
    y: number;
    data: T;
}

const MAX_ITEMS = 8;
const MAX_DEPTH = 10;

/**
 * Quadtree node that recursively subdivides space
 */
class QuadtreeNode<T> {
    private bounds: Bounds;
    private depth: number;
    private items: SpatialItem<T>[] = [];
    private children: QuadtreeNode<T>[] | null = null;

    constructor(bounds: Bounds, depth: number = 0) {
        this.bounds = bounds;
        this.depth = depth;
    }

    /**
     * Insert an item into the quadtree
     */
    insert(item: SpatialItem<T>): void {
        // If item is outside bounds, skip
        if (!this.containsPoint(item.x, item.y)) {
            return;
        }

        // If we have children, insert into the appropriate child
        if (this.children) {
            this.insertIntoChildren(item);
            return;
        }

        // Add to this node's items
        this.items.push(item);

        // Subdivide if we have too many items and haven't reached max depth
        if (this.items.length > MAX_ITEMS && this.depth < MAX_DEPTH) {
            this.subdivide();
        }
    }

    /**
     * Query all items within a rectangular region
     */
    queryRange(range: Bounds, result: SpatialItem<T>[] = []): SpatialItem<T>[] {
        // If range doesn't intersect this node's bounds, return empty
        if (!this.intersects(range)) {
            return result;
        }

        // Add items in this node that are within the range
        for (const item of this.items) {
            if (
                item.x >= range.x &&
                item.x <= range.x + range.width &&
                item.y >= range.y &&
                item.y <= range.y + range.height
            ) {
                result.push(item);
            }
        }

        // Recursively query children
        if (this.children) {
            for (const child of this.children) {
                child.queryRange(range, result);
            }
        }

        return result;
    }

    /**
     * Find the nearest item to a point within a given radius
     */
    queryRadius(x: number, y: number, radius: number): SpatialItem<T> | null {
        // Query a square region that contains the circle
        const range: Bounds = {
            x: x - radius,
            y: y - radius,
            width: radius * 2,
            height: radius * 2,
        };

        const candidates = this.queryRange(range);
        
        let nearest: SpatialItem<T> | null = null;
        let nearestDistSq = radius * radius;

        for (const item of candidates) {
            const dx = item.x - x;
            const dy = item.y - y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= nearestDistSq) {
                nearest = item;
                nearestDistSq = distSq;
            }
        }

        return nearest;
    }

    /**
     * Get the total number of items in this subtree
     */
    size(): number {
        let count = this.items.length;
        if (this.children) {
            for (const child of this.children) {
                count += child.size();
            }
        }
        return count;
    }

    /**
     * Clear all items from the quadtree
     */
    clear(): void {
        this.items = [];
        this.children = null;
    }

    private containsPoint(x: number, y: number): boolean {
        return (
            x >= this.bounds.x &&
            x <= this.bounds.x + this.bounds.width &&
            y >= this.bounds.y &&
            y <= this.bounds.y + this.bounds.height
        );
    }

    private intersects(range: Bounds): boolean {
        return !(
            range.x > this.bounds.x + this.bounds.width ||
            range.x + range.width < this.bounds.x ||
            range.y > this.bounds.y + this.bounds.height ||
            range.y + range.height < this.bounds.y
        );
    }

    private subdivide(): void {
        const { x, y, width, height } = this.bounds;
        const halfW = width / 2;
        const halfH = height / 2;
        const nextDepth = this.depth + 1;

        this.children = [
            new QuadtreeNode<T>({ x, y, width: halfW, height: halfH }, nextDepth), // NW
            new QuadtreeNode<T>({ x: x + halfW, y, width: halfW, height: halfH }, nextDepth), // NE
            new QuadtreeNode<T>({ x, y: y + halfH, width: halfW, height: halfH }, nextDepth), // SW
            new QuadtreeNode<T>({ x: x + halfW, y: y + halfH, width: halfW, height: halfH }, nextDepth), // SE
        ];

        // Move existing items into children
        for (const item of this.items) {
            this.insertIntoChildren(item);
        }
        this.items = [];
    }

    private insertIntoChildren(item: SpatialItem<T>): void {
        if (!this.children) return;

        for (const child of this.children) {
            if (child.containsPoint(item.x, item.y)) {
                child.insert(item);
                return;
            }
        }
    }
}

/**
 * Quadtree for efficient spatial queries on 2D points.
 * 
 * Use cases:
 * - Viewport culling: queryRange() returns only nodes visible in the current viewport
 * - Hit testing: queryRadius() finds the closest node to a mouse click
 * 
 * Performance:
 * - Insert: O(log n)
 * - Range query: O(log n + k) where k is the number of results
 * - Point query: O(log n)
 * 
 * @example
 * ```typescript
 * const qt = new Quadtree<NodeData>({ x: 0, y: 0, width: 10000, height: 50000 });
 * 
 * // Insert nodes
 * for (const node of nodes) {
 *   qt.insert(node.x, node.y, node);
 * }
 * 
 * // Query visible nodes
 * const visible = qt.queryRange(viewportBounds);
 * 
 * // Hit test
 * const clicked = qt.queryRadius(mouseX, mouseY, 20);
 * ```
 */
export class Quadtree<T> {
    private root: QuadtreeNode<T>;
    private bounds: Bounds;

    constructor(bounds: Bounds) {
        this.bounds = bounds;
        this.root = new QuadtreeNode<T>(bounds);
    }

    /**
     * Insert an item at a specific position
     */
    insert(x: number, y: number, data: T): void {
        this.root.insert({ x, y, data });
    }

    /**
     * Bulk insert multiple items (more efficient than individual inserts)
     */
    insertAll(items: Array<{ x: number; y: number; data: T }>): void {
        for (const item of items) {
            this.root.insert(item);
        }
    }

    /**
     * Query all items within a rectangular region
     */
    queryRange(range: Bounds): SpatialItem<T>[] {
        return this.root.queryRange(range);
    }

    /**
     * Find the nearest item to a point within a given radius
     * Returns null if no item is within the radius
     */
    queryRadius(x: number, y: number, radius: number): T | null {
        const result = this.root.queryRadius(x, y, radius);
        return result?.data ?? null;
    }

    /**
     * Get the total number of items in the quadtree
     */
    size(): number {
        return this.root.size();
    }

    /**
     * Clear and rebuild the quadtree with new bounds
     */
    rebuild(bounds: Bounds): void {
        this.bounds = bounds;
        this.root = new QuadtreeNode<T>(bounds);
    }

    /**
     * Clear all items from the quadtree
     */
    clear(): void {
        this.root.clear();
    }

    /**
     * Get the bounds of this quadtree
     */
    getBounds(): Bounds {
        return this.bounds;
    }
}

/**
 * Create a quadtree sized for a git graph visualization
 * @param nodeCount Approximate number of nodes
 * @param laneCount Number of lanes
 * @param rowHeight Pixels per row
 * @param laneWidth Pixels per lane
 * @param padding Padding around the graph
 */
export function createGraphQuadtree<T>(
    nodeCount: number,
    laneCount: number,
    rowHeight: number,
    laneWidth: number,
    padding: number = 200
): Quadtree<T> {
    const width = (laneCount + 1) * laneWidth + padding * 2;
    const height = nodeCount * rowHeight + padding * 2;
    
    return new Quadtree<T>({
        x: -padding,
        y: -padding,
        width,
        height,
    });
}
