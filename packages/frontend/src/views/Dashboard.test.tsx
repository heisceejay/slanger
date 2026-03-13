import { render, screen } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom";

const mockLang: any = {
  meta: {
    name: "Test Language",
    preset: "naturalistic",
    version: 1,
    tags: ["test"],
  },
  phonology: {
    inventory: { consonants: [], vowels: [], tones: [] },
    phonotactics: { syllableTemplates: [] },
    writingSystem: { mappings: {}, glyphs: {} }
  },
  morphology: {
    paradigms: {},
    typology: "analytic",
    categories: { noun: [], verb: [] },
  },
  syntax: {
    wordOrder: "SVO",
    alignment: "nominative-accusative"
  },
  lexicon: [],
  corpus: [],
  validationState: { errors: [], warnings: [], lastRun: new Date().toISOString() },
};

describe("Dashboard", () => {
  it("renders correctly with language data", () => {
    render(
      <Dashboard 
        lang={mockLang} 
        onRefresh={() => {}} 
        onNavigate={() => {}} 
      />
    );

    expect(screen.getByText("Test Language")).toBeInTheDocument();
    expect(screen.getByText("Validation", { selector: ".panel-title" })).toBeInTheDocument();
    expect(screen.getByText(/All modules pass validation/i)).toBeInTheDocument();
  });

  it("shows error count when validation errors exist", () => {
    const errorLang = {
      ...mockLang,
      validationState: {
        ...mockLang.validationState,
        errors: [{ module: "phonology", message: "Bad phoneme" }]
      }
    };

    render(
      <Dashboard 
        lang={errorLang} 
        onRefresh={() => {}} 
        onNavigate={() => {}} 
      />
    );

    expect(screen.getByText(/1 errors/i)).toBeInTheDocument();
    expect(screen.getByText(/Bad phoneme/i)).toBeInTheDocument();
  });
});
