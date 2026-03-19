// ─────────────────────────────────────────────────────────────────────────────
// PROJECT SERVICE — Unit Tests
//
// Tests ProjectService methods in isolation by replacing the real database
// repositories with mock objects. No database connection is needed.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectService } from "../../services/project.service";
import { NotFoundError } from "@risk-engine/http";

// ─── Fake repositories ────────────────────────────────────────────────────────
// ProjectService depends on two repositories. We replace them with plain
// objects where every method is a vi.fn() — a spy that records calls and
// can be configured to return whatever we need per test.

const mockProjectRepo = {
  create: vi.fn(),
  findAllByOrg: vi.fn(),
  findByIdAndOrg: vi.fn(),
  updateByIdAndOrg: vi.fn(),
  deleteByIdAndOrg: vi.fn(),
};

const mockApiKeyRepo = {
  // ProjectService calls apiKeyRepo.create() twice when creating a project
  // (once for the secret key, once for the publishable key).
  create: vi.fn(),
};

// ─── Helper ───────────────────────────────────────────────────────────────────
// Small factory to avoid repeating `new ProjectService(...)` in every test.
// `as never` is a TypeScript cast that lets us pass a partial mock object
// where the real type is expected — safe to use in tests.
function makeService() {
  return new ProjectService(mockProjectRepo as never, mockApiKeyRepo as never);
}

// ─── Test suite ───────────────────────────────────────────────────────────────
describe("ProjectService", () => {
  // Reset call history before every test so tests don't interfere with each other.
  // e.g. without this, checking `.toHaveBeenCalledTimes(2)` in one test could
  // be polluted by calls from a previous test.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getById() ───────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("throws NotFoundError when project does not exist", async () => {
      // Simulate the DB returning nothing for this project ID.
      mockProjectRepo.findByIdAndOrg.mockResolvedValue(null);

      // The service wraps a null result in a NotFoundError.
      // .rejects.toBeInstanceOf() unwraps the rejected promise and checks the type.
      await expect(makeService().getById("org1", "p1")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns the project when found", async () => {
      const project = { id: "p1", name: "My Project", organizationId: "org1" };
      mockProjectRepo.findByIdAndOrg.mockResolvedValue(project);

      // .resolves.toEqual() unwraps the resolved promise and does a deep equality
      // check — every key and value must match exactly.
      await expect(makeService().getById("org1", "p1")).resolves.toEqual(project);
    });
  });

  // ── create() ────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("creates project and returns secret and publishable keys with correct prefixes", async () => {
      const project = { id: "p1", name: "New Project", organizationId: "org1" };
      mockProjectRepo.create.mockResolvedValue(project);
      // apiKeyRepo.create is called twice; we just make it succeed both times.
      mockApiKeyRepo.create.mockResolvedValue({});

      const result = await makeService().create("org1", { name: "New Project" });

      // Check the project itself was returned.
      expect(result.project).toEqual(project);

      // .toMatch() checks a string against a regex or substring.
      // We verify the key format is correct without checking the random suffix.
      expect(result.secretKey).toMatch(/^vig_sk_/);
      expect(result.publishableKey).toMatch(/^vig_pk_/);

      // .toHaveBeenCalledTimes(n) verifies the spy was called exactly n times.
      // The service creates one secret key and one publishable key → 2 inserts.
      expect(mockApiKeyRepo.create).toHaveBeenCalledTimes(2);
    });
  });

  // ── delete() ────────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("throws NotFoundError when project does not exist", async () => {
      // The repository returns null when no row was deleted (project didn't exist).
      mockProjectRepo.deleteByIdAndOrg.mockResolvedValue(null);

      await expect(makeService().delete("org1", "p1")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("resolves successfully when project is deleted", async () => {
      // The repository returns the deleted row when deletion succeeds.
      mockProjectRepo.deleteByIdAndOrg.mockResolvedValue({ id: "p1" });

      // delete() has no return value (void). .resolves.toBeUndefined() confirms
      // the promise resolves (doesn't reject) and returns nothing.
      await expect(makeService().delete("org1", "p1")).resolves.toBeUndefined();
    });
  });
});
