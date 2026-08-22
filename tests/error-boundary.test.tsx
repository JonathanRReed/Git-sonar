import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@components/ErrorBoundary';

let shouldThrow = true;

function RecoverableChild() {
    if (shouldThrow) {
        throw new Error('Test failure');
    }

    return <p>Recovered content</p>;
}

describe('ErrorBoundary', () => {
    beforeEach(() => {
        shouldThrow = true;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('lets the user retry without forcing a page reload', () => {
        render(
            <ErrorBoundary>
                <RecoverableChild />
            </ErrorBoundary>,
        );

        shouldThrow = false;
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

        expect(screen.getByText('Recovered content')).toBeTruthy();
    });
});
