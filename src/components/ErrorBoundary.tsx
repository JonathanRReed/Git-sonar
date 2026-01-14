import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { debugError } from '@lib/utils/debug';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        debugError('ErrorBoundary', 'caught an error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                this.props.fallback || (
                    <div className="error-boundary">
                        <div className="error-boundary__content">
                            <span className="error-boundary__icon"><AlertTriangle size={32} /></span>
                            <h2 className="error-boundary__title">Something went wrong</h2>
                            <p className="error-boundary__message">
                                An unexpected error occurred. Please try refreshing the page.
                            </p>
                            {this.state.error && (
                                <details className="error-boundary__details">
                                    <summary>Technical details</summary>
                                    <pre className="error-boundary__stack">
                                        {this.state.error.toString()}
                                    </pre>
                                </details>
                            )}
                            <button
                                className="error-boundary__button"
                                onClick={() => window.location.reload()}
                            >
                                Refresh Page
                            </button>
                        </div>
                    </div>
                )
            );
        }

        return this.props.children;
    }
}
