import React from 'react';
import { toast } from 'react-toastify';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Update state
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Show toast notification
    toast.error('An error occurred. Please try refreshing the page.');
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback({ 
        error: this.state.error,
        reset: () => this.setState({ hasError: false, error: null })
      });
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 