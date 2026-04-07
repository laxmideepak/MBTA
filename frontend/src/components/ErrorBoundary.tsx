import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', minHeight: 200,
          background: 'rgba(20, 20, 20, 0.95)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)', padding: 32, margin: 16,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {this.props.fallbackMessage ?? 'Something went wrong'}
          </div>
          <div style={{ color: '#767676', fontSize: 13, marginBottom: 16 }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#e0e0e0', padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
