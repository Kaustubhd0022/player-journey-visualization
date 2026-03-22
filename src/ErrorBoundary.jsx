import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#050810', gap: 20, padding: 40,
        }}>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: 32, color: '#EF4444', fontWeight: 700 }}>
            ⚠ APP ERROR
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#94A3B8',
            background: '#0D1320', border: '1px solid #1E2D42',
            padding: '20px 24px', maxWidth: 800, whiteSpace: 'pre-wrap', lineHeight: 1.7,
          }}>
            {this.state.error?.message}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#4B6280' }}>
            Check the browser console for full stack trace. Press F5 to reload.
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              fontFamily: "'Rajdhani',sans-serif", fontSize: 14, fontWeight: 600,
              padding: '8px 24px', background: '#1E2D42', color: '#00C8FF',
              border: '1px solid rgba(0,200,255,.3)', cursor: 'pointer',
            }}
          >
            Try to Recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
