// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES — Integration Tests
//
// These tests cover the HTTP layer: Zod validation, correct status codes, and
// error propagation from the service layer to the HTTP response.
//
// Strategy:
//   - Build a real Express app with the actual route definitions mounted.
//   - Replace AuthService with a mock so tests don't need a database.
//   - Use supertest to fire real HTTP requests against it.
//
// This is different from the service unit tests: here we're testing that the
// route wiring (middleware order, error handler, status codes) is correct.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { errorHandler } from "@risk-engine/http";   // converts HttpError → JSON response
import { createAuthRouter } from "../../routes/auth.routes";
import { AuthController } from "../../controllers/auth.controller";
import type { RequestHandler } from "express";

// ─── No-op authenticate middleware ───────────────────────────────────────────
// Some routes (e.g. GET /auth/me) are protected by the `authenticate`
// middleware. For these route tests we don't want to test auth — we just want
// to call next() unconditionally so the route handler runs.
// This is a stand-in that does exactly that.
const noopAuth: RequestHandler = (_req, _res, next) => next();

// ─── Test app factory ─────────────────────────────────────────────────────────
// Accepts optional overrides so individual tests can swap out specific service
// methods (e.g. make `signup` throw a ConflictError).
//
// serviceOverrides is typed as Record<string, unknown> so we can spread any
// key/value pair into the mock without TypeScript complaining.
function buildApp(serviceOverrides: Record<string, unknown> = {}) {
  // Default mock service: every method succeeds with a realistic-looking response.
  // Tests that need failure behaviour pass overrides via serviceOverrides.
  const mockService = {
    // vi.fn().mockResolvedValue(x) — spy that always resolves with x.
    signup: vi.fn().mockResolvedValue({ message: "Check your email" }),
    login: vi.fn().mockResolvedValue({
      user:         { id: "u1", email: "a@b.com", name: "A" },
      organization: { id: "o1", name: "Org", plan: "FREE" },
      token:        "signed-jwt",
    }),
    // These methods aren't under test here, so they just need to exist.
    verifyEmail:          vi.fn(),
    resendVerification:   vi.fn(),
    forgotPassword:       vi.fn(),
    resetPassword:        vi.fn(),
    // cookieMaxAge is a getter on the real service — we provide a plain number.
    cookieMaxAge: 604800000, // 7 days in milliseconds

    // Spread the overrides LAST so they replace the defaults above.
    // e.g. passing { signup: vi.fn().mockRejectedValue(new ConflictError()) }
    // replaces just the signup spy with one that throws.
    ...serviceOverrides,
  };

  // Plug the mock service into the real AuthController.
  // `as never` bypasses the TypeScript type check — our mock object satisfies
  // the runtime contract even though it isn't a full AuthService instance.
  const ctrl = new AuthController(mockService as never);

  const app = express();
  app.use(express.json());    // parse JSON request bodies
  app.use(cookieParser());    // parse Cookie headers (needed by logout/me)

  // Mount the real router — this is what we're actually testing.
  app.use(createAuthRouter(ctrl, noopAuth));

  // errorHandler converts thrown HttpError instances into JSON responses.
  // e.g. new ConflictError("...") → HTTP 409 { message: "..." }
  // It must come AFTER the routes.
  app.use(errorHandler);

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/signup
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/signup", () => {
  // ── Zod validation (the `validate()` middleware rejects bad input) ──────────
  // These tests verify the route wiring: bad request bodies must be caught
  // BEFORE the controller or service is ever called.

  it("returns 400 for missing required fields", async () => {
    // Only email is provided — name, password, orgName are all missing.
    // The Zod schema in auth.routes.ts will reject this and throw BadRequestError (400).
    const res = await request(buildApp()).post("/auth/signup").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    // All fields are present, but the email fails Zod's .email() check.
    const res = await request(buildApp())
      .post("/auth/signup")
      .send({ email: "not-an-email", name: "A", password: "password1", orgName: "Org" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for password shorter than 8 chars", async () => {
    // Zod schema has .min(8) on the password field.
    const res = await request(buildApp())
      .post("/auth/signup")
      .send({ email: "a@b.com", name: "A", password: "short", orgName: "Org" });
    expect(res.status).toBe(400);
  });

  // ── Service error propagation ───────────────────────────────────────────────
  // The Zod schema passed. Now we check that errors thrown by the service
  // layer are converted to the right HTTP status codes by errorHandler.

  it("returns 409 when service throws ConflictError", async () => {
    // Import the error class so we can throw an instance of it.
    const { ConflictError } = await import("@risk-engine/http");

    // Override the signup spy to REJECT (throw) instead of resolve.
    // .mockRejectedValue(x) is the async equivalent of .mockImplementation(() => { throw x })
    const app = buildApp({
      signup: vi.fn().mockRejectedValue(new ConflictError("Email already registered")),
    });

    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "a@b.com", name: "A", password: "password1", orgName: "Org" });

    // ConflictError has statusCode 409.
    expect(res.status).toBe(409);
    // The errorHandler serialises the error message into the response body.
    expect(res.body.message).toBe("Email already registered");
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns 201 with a message on success", async () => {
    // Default buildApp() has signup resolving successfully.
    const res = await request(buildApp())
      .post("/auth/signup")
      .send({ email: "a@b.com", name: "A", password: "password1", orgName: "Org" });

    // The controller calls res.status(201).json(result).
    expect(res.status).toBe(201);
    expect(res.body.message).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /auth/login", () => {
  // ── Zod validation ──────────────────────────────────────────────────────────

  it("returns 400 for missing password", async () => {
    // The loginSchema requires both email and password.
    const res = await request(buildApp()).post("/auth/login").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(buildApp()).post("/auth/login").send({ email: "bad", password: "password1" });
    expect(res.status).toBe(400);
  });

  // ── Service error propagation ───────────────────────────────────────────────

  it("returns 401 when service throws UnauthorizedError", async () => {
    const { UnauthorizedError } = await import("@risk-engine/http");

    const app = buildApp({
      login: vi.fn().mockRejectedValue(new UnauthorizedError("Invalid email or password")),
    });

    const res = await request(app).post("/auth/login").send({ email: "a@b.com", password: "wrong" });

    // UnauthorizedError has statusCode 401.
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns 200 with user and org on success", async () => {
    // Default buildApp() has login resolving with a mock user + org.
    const res = await request(buildApp()).post("/auth/login").send({ email: "a@b.com", password: "password1" });

    expect(res.status).toBe(200);
    // Spot-check the response shape — we don't assert every field,
    // just the ones that confirm the controller returned the right data.
    expect(res.body.user.email).toBe("a@b.com");
    expect(res.body.organization.id).toBe("o1");
  });
});
