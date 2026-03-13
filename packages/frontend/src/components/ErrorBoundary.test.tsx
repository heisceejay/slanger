import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";

const ThrowError = () => {
  throw new Error("Test error");
}

describe("ErrorBoundary", () => {
  it("should catch errors and display fallback UI", () => {
    // Suppress console.error for this test as it's expected
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Test error/i)).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  });

  it("should render children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Safe Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText(/Safe Content/i)).toBeInTheDocument();
  });
});
