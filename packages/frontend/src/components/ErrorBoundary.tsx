import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
          return this.props.fallback;
      }
      
      return (
        <div style={{ padding: "2rem", color: "white", backgroundColor: "#2d3748", borderRadius: "8px", margin: "1rem" }}>
          <h2 style={{ color: "#fc8181", marginTop: 0 }}>Something went wrong</h2>
          <p>An unexpected error occurred in this section of the application.</p>
          <pre style={{ backgroundColor: "#1a202c", padding: "1rem", borderRadius: "4px", overflowX: "auto", fontSize: "0.875rem" }}>
            {this.state.error?.message || "Unknown error"}
          </pre>
          <button 
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{ 
                marginTop: "1rem", 
                padding: "0.5rem 1rem", 
                backgroundColor: "#4a5568", 
                color: "white", 
                border: "none", 
                borderRadius: "4px", 
                cursor: "pointer" 
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
