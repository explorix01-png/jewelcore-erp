import React from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("JewelCore ERP ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full rounded-2xl border border-red-200/80 bg-card p-6 sm:p-8 text-center shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200/60 text-red-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Module Encountered an Issue
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              An unexpected error occurred while rendering this view. Your store data remains safe and unaffected.
            </p>

            {this.state.error && (
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-left overflow-x-auto max-h-32">
                <p className="font-mono text-[11px] text-red-700 font-semibold break-words">
                  {this.state.error?.message || String(this.state.error)}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-3 mt-6">
              <Button
                onClick={this.handleReset}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reload View
              </Button>
              <Button
                variant="outline"
                onClick={() => { window.location.href = "/"; }}
                className="border-slate-200 hover:bg-slate-50 text-xs text-slate-700"
              >
                <Home className="w-3.5 h-3.5 mr-1.5" /> Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
