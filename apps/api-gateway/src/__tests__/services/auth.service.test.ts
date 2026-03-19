// ─────────────────────────────────────────────────────────────────────────────
// AUTH SERVICE — Unit Tests
//
// A "unit test" tests one piece of logic in total isolation.
// We test AuthService methods directly, without a real database, real email
// server, or real HTTP request. Anything the service depends on gets replaced
// with a "mock" — a fake version we fully control.
// ─────────────────────────────────────────────────────────────────────────────

// Vitest is the test runner. We import the building blocks we need:
//   describe  – groups related tests together (like a folder)
//   it        – a single test case ("it should do X")
//   expect    – makes assertions ("I expect this value to be Y")
//   vi        – Vitest's utility for creating mocks and spies
//   beforeEach– runs a setup function before every individual test
import { describe, it, expect, vi, beforeEach } from "vitest";

// Import the real class we are testing.
import { AuthService } from "../../services/auth.service";

// Import error classes so we can assert that the right error type is thrown.
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "@risk-engine/http";

// ─── Module mocks ─────────────────────────────────────────────────────────────
// The email package makes real network calls — we never want that during tests.
// vi.mock() replaces the ENTIRE module with a fake implementation.
// Vitest hoists vi.mock() calls to the very top of the file automatically,
// so they take effect before any imports are evaluated.
vi.mock("@risk-engine/email", () => ({
  // vi.fn() creates a "spy function" — a fake function Vitest can track.
  // .mockResolvedValue(x) means: when called, return Promise.resolve(x).
  sendEmail: vi.fn().mockResolvedValue(undefined),
  // .mockReturnValue(x) means: when called, return x synchronously.
  buildVerifyEmail: vi.fn().mockReturnValue({ subject: "Verify", html: "<p></p>" }),
  buildResetPasswordEmail: vi.fn().mockReturnValue({ subject: "Reset", html: "<p></p>" }),
}));

// bcryptjs hashes passwords with an intentionally slow algorithm (for security).
// In tests we don't need real hashing, so we replace it with instant fakes.
// Note the `default:` key — this matches how bcrypt is exported (ES default export).
vi.mock("bcryptjs", () => ({
  default: {
    // hash() will always instantly "return" a fake hash string.
    hash: vi.fn().mockResolvedValue("$hashed"),
    // compare() has NO default return value here — each test that needs it
    // will configure it individually (see the login tests below).
    compare: vi.fn(),
  },
}));

// ─── Fake repositories ────────────────────────────────────────────────────────
// AuthService expects an AuthRepository and an OrganizationRepository injected
// via its constructor. Instead of creating real ones (which need a DB), we
// create plain objects where every method is a vi.fn() spy.
//
// By default, a vi.fn() with no configuration returns `undefined` when called.
// In each test we configure the ones we care about with mockResolvedValue().

const mockUserRepo = {
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  // This one always succeeds (returns undefined) — we don't need to customise it.
  createVerificationToken: vi.fn().mockResolvedValue(undefined),
  findVerificationTokenByUserId: vi.fn(),
};

const mockOrgRepo = {
  create: vi.fn(),
  addMember: vi.fn(),
  findFirstMembership: vi.fn(),
};

// ─── Helper ───────────────────────────────────────────────────────────────────
// Instead of calling `new AuthService(...)` in every test, we have one factory
// function. `signupDisabled` defaults to false so most tests don't need to pass it.
//
// `as never` is a TypeScript escape hatch — it tells the compiler "trust me,
// this mock object is compatible with the real type." We use it because our
// mock objects only have the methods each test actually calls, not the full
// interface.
function makeService(signupDisabled = false) {
  return new AuthService(
    mockUserRepo as never,
    mockOrgRepo as never,
    "test-secret", // JWT secret — any string works in tests
    signupDisabled,
  );
}

// ─── Test suite ───────────────────────────────────────────────────────────────
// describe() groups tests. They can be nested — the outer group is the class,
// inner groups are individual methods.
describe("AuthService", () => {
  // beforeEach() runs BEFORE every single `it()` block in this describe.
  // vi.clearAllMocks() resets call history (how many times each mock was called,
  // what args it received) WITHOUT removing the mock implementations.
  // This ensures tests don't accidentally share state or call counts.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── signup() ────────────────────────────────────────────────────────────────
  describe("signup", () => {
    it("throws ForbiddenError when signup is disabled", async () => {
      // We pass `true` to makeService() to simulate the feature flag being ON.
      // The service should reject immediately, before touching the DB.
      await expect(
        makeService(true).signup({ email: "a@b.com", name: "A", password: "password1", orgName: "Org" }),
      // .rejects — tells expect() to unwrap the rejected promise.
      // .toBeInstanceOf() — checks that the thrown value is of that class.
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("throws BadRequestError for invalid email", async () => {
      // The service has its own regex check before touching the DB.
      // "not-an-email" has no @, so it should fail immediately.
      await expect(
        makeService().signup({ email: "not-an-email", name: "A", password: "password1", orgName: "Org" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("throws BadRequestError for password shorter than 8 chars", async () => {
      // "short" is only 5 characters, below the 8-character minimum.
      await expect(
        makeService().signup({ email: "a@b.com", name: "A", password: "short", orgName: "Org" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("throws ConflictError when email is already registered", async () => {
      // Arrange: make the DB lookup return a user, simulating a duplicate email.
      // .mockResolvedValue(x) makes the spy return Promise.resolve(x) on the next call.
      mockUserRepo.findUserByEmail.mockResolvedValue({ id: "u1", email: "a@b.com" });

      // Act + Assert: the service should detect the duplicate and throw.
      await expect(
        makeService().signup({ email: "a@b.com", name: "A", password: "password1", orgName: "Org" }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("returns a success message on valid input", async () => {
      // Arrange: set up every repo call the service will make during a happy-path signup.
      mockUserRepo.findUserByEmail.mockResolvedValue(null);       // no duplicate
      mockUserRepo.createUser.mockResolvedValue({ id: "u1", email: "a@b.com", name: "A" });
      mockOrgRepo.create.mockResolvedValue({ id: "o1", name: "Org" });
      mockOrgRepo.addMember.mockResolvedValue(undefined);

      // Act: call the real service method.
      const result = await makeService().signup({
        email: "a@b.com",
        name: "A",
        password: "password1",
        orgName: "Org",
      });

      // Assert: the service should return an object with a truthy `message` string.
      // .toBeTruthy() passes for any value that is not null/undefined/false/""/0.
      expect(result.message).toBeTruthy();
    });
  });

  // ── login() ─────────────────────────────────────────────────────────────────
  describe("login", () => {
    it("throws UnauthorizedError when user is not found", async () => {
      // DB returns null → no account with that email.
      mockUserRepo.findUserByEmail.mockResolvedValue(null);

      await expect(makeService().login({ email: "x@x.com", password: "pass" })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("throws UnauthorizedError for wrong password", async () => {
      // We need to configure the bcrypt mock for this test specifically.
      // `await import()` gives us the mocked module instance at runtime.
      const bcrypt = await import("bcryptjs");
      // vi.mocked() wraps the function so TypeScript knows it's a spy and lets
      // us call .mockResolvedValue() on it.
      // `false as never` — bcrypt.compare returns Promise<boolean | false>, but
      // the TypeScript generic inference gets confused with mocked types, so
      // `as never` silences the complaint without changing the runtime value.
      vi.mocked(bcrypt.default.compare).mockResolvedValue(false as never);

      // findUserByEmail returns a user — the account exists — but bcrypt.compare
      // returns false, meaning the password doesn't match.
      mockUserRepo.findUserByEmail.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        passwordHash: "$hashed",
        emailVerified: true,
      });

      await expect(makeService().login({ email: "a@b.com", password: "wrong" })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("throws UnauthorizedError for unverified email", async () => {
      // Password matches (compare returns true), but email is not yet verified.
      const bcrypt = await import("bcryptjs");
      vi.mocked(bcrypt.default.compare).mockResolvedValue(true as never);

      // emailVerified: false — the account exists and the password is correct,
      // but the user hasn't clicked the verification link yet.
      mockUserRepo.findUserByEmail.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        passwordHash: "$hashed",
        emailVerified: false,
      });

      await expect(makeService().login({ email: "a@b.com", password: "pass" })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("returns user, org, and signed token on success", async () => {
      // Full happy path: user exists, password matches, email is verified.
      const bcrypt = await import("bcryptjs");
      vi.mocked(bcrypt.default.compare).mockResolvedValue(true as never);

      mockUserRepo.findUserByEmail.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        name: "A",
        passwordHash: "$hashed",
        emailVerified: true,
      });
      mockOrgRepo.findFirstMembership.mockResolvedValue({
        org: { id: "o1", name: "Org", plan: "FREE" },
      });

      const result = await makeService().login({ email: "a@b.com", password: "pass" });

      // .toMatchObject() checks that the object CONTAINS these keys/values.
      // It passes even if the object has extra keys we don't list here.
      expect(result.user).toMatchObject({ id: "u1", email: "a@b.com" });
      expect(result.organization).toMatchObject({ id: "o1" });
      // We just verify a token string was returned — not its exact content,
      // because the value changes with every call (it encodes a timestamp).
      expect(result.token).toBeTruthy();
    });
  });
});
