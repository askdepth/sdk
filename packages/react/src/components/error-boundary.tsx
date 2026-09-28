'use client';

import { Askdepth } from '@askdepth/core';
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearLastUserInteraction, getLastUserInteraction } from '../interaction.js';
import type { AskdepthFallback } from '../types.js';

interface Props {
  children?: ReactNode;
  fallback?: AskdepthFallback;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AskdepthCatch extends Component<Props, State> {
  public static displayName = 'AskdepthCatch';
  private reportTimer: ReturnType<typeof setTimeout> | null = null;

  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    const target = getLastUserInteraction(500)?.targetElement ?? null;
    const componentStack = info.componentStack ?? undefined;
    if (Askdepth.isInitialized()) {
      Askdepth.reportCaughtError(error, target, componentStack);
    } else {
      if (this.reportTimer) clearTimeout(this.reportTimer);
      this.reportTimer = setTimeout(() => {
        this.reportTimer = null;
        Askdepth.reportCaughtError(error, target, componentStack);
      }, 0);
    }
    clearLastUserInteraction();
  }

  public override componentWillUnmount(): void {
    if (this.reportTimer) clearTimeout(this.reportTimer);
  }

  private resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') return fallback(this.state.error, this.resetErrorBoundary);
      if (fallback) return fallback;
      return (
        <div role="alert" style={{ padding: '16px', border: '1px solid #EF4444', borderRadius: '6px' }}>
          <h2>Something went wrong</h2>
          <p>Please try again.</p>
          <button type="button" onClick={this.resetErrorBoundary}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
