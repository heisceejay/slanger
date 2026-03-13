import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { 
  createLanguage, 
  listLanguages, 
  getLanguage, 
  deleteLanguage, 
  updateLanguage,
  pushVersionSnapshot,
  rollbackToVersion
} from "./api";

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

vi.stubGlobal("sessionStorage", sessionStorageMock);

describe("api.ts state management", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a new language and add it to the list", () => {
    const lang = createLanguage({ name: "Test Lang", naturalismScore: 0.5 });
    expect(lang.meta.name).toBe("Test Lang");
    expect(lang.meta.naturalismScore).toBe(0.5);
    expect(lang.meta.id).toBeDefined();

    const langs = listLanguages();
    expect(langs).toHaveLength(1);
    expect(langs[0].meta.id).toBe(lang.meta.id);
  });

  it("should get a language by id", () => {
    const created = createLanguage({ name: "Find Me" });
    const found = getLanguage(created.meta.id);
    expect(found).not.toBeNull();
    expect(found?.meta.name).toBe("Find Me");
  });

  it("should update a language", () => {
    const lang = createLanguage({ name: "Old Name" });
    const updated = updateLanguage(lang.meta.id, { meta: { ...lang.meta, name: "New Name" } });
    expect(updated?.meta.name).toBe("New Name");
    
    const found = getLanguage(lang.meta.id);
    expect(found?.meta.name).toBe("New Name");
  });

  it("should delete a language", () => {
    const lang = createLanguage({ name: "Delete Me" });
    const deleted = deleteLanguage(lang.meta.id);
    expect(deleted).toBe(true);
    expect(listLanguages()).toHaveLength(0);
  });

  it("should handle version history snapshots and rollback", () => {
    let lang = createLanguage({ name: "V1" });
    
    // Step 1: Snapshot V1
    pushVersionSnapshot(lang, "Snapshot 1");
    
    // Step 2: Modify to V2
    lang = updateLanguage(lang.meta.id, { meta: { ...lang.meta, name: "V2" } })!;
    expect(lang.meta.name).toBe("V2");
    expect(lang.meta.versionHistory).toHaveLength(1);
    expect(lang.meta.versionHistory![0].label).toBe("Snapshot 1");

    // Step 3: Rollback
    const restored = rollbackToVersion(lang.meta.id, 0);
    expect(restored).not.toBeNull();
    expect(restored?.meta.name).toBe("V1");
    expect(getLanguage(lang.meta.id)?.meta.name).toBe("V1");
  });

  it("should limit version history size", () => {
    const lang = createLanguage({ name: "History Test" });
    // Push 20 snapshots (limit is 15)
    for (let i = 1; i <= 20; i++) {
      pushVersionSnapshot(getLanguage(lang.meta.id)!, `Step ${i}`);
    }
    
    const final = getLanguage(lang.meta.id);
    expect(final?.meta.versionHistory).toHaveLength(15);
    expect(final?.meta.versionHistory![0].label).toBe("Step 6");
    expect(final?.meta.versionHistory![14].label).toBe("Step 20");
  });
});
