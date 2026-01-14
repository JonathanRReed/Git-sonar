import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

export function useThrottle<T extends (...args: unknown[]) => void>(
    callback: T,
    delay: number
): T {
    const lastRunRef = useRef(0);
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    return useCallback((...args: Parameters<T>) => {
        const now = Date.now();
        if (now - lastRunRef.current >= delay) {
            lastRunRef.current = now;
            callbackRef.current(...args);
        }
    }, [delay]) as T;
}
