import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#fee2e2', border: '1px solid #ef4444', margin: '2rem', borderRadius: '8px' }}>
          <h2 style={{ color: '#b91c1c' }}>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', color: '#7f1d1d' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo ? this.state.errorInfo.componentStack : 'Loading stack trace...'}
          </details>
        </div>
      );
    }

    return this.props.children; 
  }
}
