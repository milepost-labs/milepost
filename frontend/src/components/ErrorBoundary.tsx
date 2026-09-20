import React from 'react';
import { Link } from 'react-router-dom';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { error } = this.state;
      return (
        <div className="error-boundary" role="alert" style={{ padding: 'var(--space-6)', maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 var(--space-2)' }}>Something went wrong</h1>
          <p className="typo-text text-muted" style={{ margin: '0 0 var(--space-4)' }}>
            The app hit an unexpected error and couldn&apos;t render this page. This is a display problem — you&apos;re still
            connected and navigation is still available.
          </p>

          <div
            style={{
              padding: 'var(--space-4)',
              border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
              background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>If you just submitted a transaction, its outcome is unknown.</p>
            <p className="typo-text text-muted" style={{ margin: '0.5rem 0 0' }}>
              It may have succeeded, failed, or still be pending. Do not resubmit blindly — check the explorer or your
              wallet history before trying again.
            </p>
            <p className="typo-text" style={{ margin: '0.75rem 0 0', fontSize: 'var(--text-sm)' }}>
              <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer">
                View on Stellar Expert (testnet)
              </a>
              {' · '}
              <a href="https://horizon-testnet.stellar.org" target="_blank" rel="noreferrer">
                Horizon testnet
              </a>
            </p>
          </div>

          {error && (
            <details style={{ marginBottom: 'var(--space-4)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--text-sm)' }}>Error details</summary>
              <pre
                style={{
                  marginTop: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  background: 'var(--surface-hover)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'auto',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {error.message}
                {error.stack ? `\n\n${error.stack.slice(0, 2000)}` : ''}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
            <button type="button" className="ui-button ui-button--primary" onClick={this.handleReset}>
              Try again
            </button>
            <Link to="/" className="ui-button ui-button--secondary" onClick={this.handleReset}>
              Go to home
            </Link>
          </div>

          <nav aria-label="Main sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <Link to="/directory" className="ui-button ui-button--ghost ui-button--sm">Directory</Link>
            <Link to="/funders" className="ui-button ui-button--ghost ui-button--sm">Funders</Link>
            <Link to="/recipients" className="ui-button ui-button--ghost ui-button--sm">Recipients</Link>
            <Link to="/verifiers" className="ui-button ui-button--ghost ui-button--sm">Verifiers</Link>
            <Link to="/attestations" className="ui-button ui-button--ghost ui-button--sm">Attestations</Link>
            <Link to="/policy" className="ui-button ui-button--ghost ui-button--sm">Policy</Link>
            <Link to="/admin" className="ui-button ui-button--ghost ui-button--sm">Admin</Link>
          </nav>
        </div>
      );
    }

    return this.props.children;
  }
}
