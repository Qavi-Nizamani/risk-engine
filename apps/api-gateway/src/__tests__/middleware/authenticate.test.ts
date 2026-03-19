// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATE MIDDLEWARE — Integration-style Unit Tests
//
// The authenticate middleware sits between the HTTP request and route handlers.
// It reads either an `X-Api-Key` header or a `session` cookie and either
// populates `req.auth` (success) or returns a 401/403 response (failure).
//
// Strategy: we mount the middleware on a minimal Express app using supertest
// to fire real HTTP requests against it. The database is replaced with a mock
// object, so no real DB connection is needed.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser"; // parses the Cookie header into req.cookies
import request from "supertest";          // fires HTTP requests against an Express app in-process
import jwt from "jsonwebtoken";            // lets us create valid JWTs for the happy-path tests
import { createAuthMiddleware } from "../../middleware/authenticate";

// A fixed secret used to sign/verify JWTs in tests.
// Must match what we pass to createAuthMiddleware below.
const JWT_SECRET = "test-secret";

// ─── Shared fake data ─────────────────────────────────────────────────────────
// Reusable objects that represent DB rows. We reference them when configuring
// the mock DB results.
const mockOrg     = { id: "org1", name: "Org", plan: "FREE" };
const mockUser    = { id: "u1",   email: "a@b.com", name: "A" };
const mockProject = { id: "p1",   name: "P", organizationId: "org1" };
const mockApiKey  = { id: "k1",   type: "secret", projectId: "p1" };

// ─── Mock DB builders ─────────────────────────────────────────────────────────
// The middleware calls the real Drizzle query builder fluently:
//   db.select({...}).from(table).innerJoin(...).where(...).limit(1)
//
// We mimic this fluent API with a chainable fake object. Every intermediate
// method returns `chain` again (so you can keep chaining), and `.limit()`
// finally resolves the Promise with whatever result we pre-configured.

/**
 * Builds a mock DB suitable for the API-key auth path.
 * The middleware does one SELECT (with joins) and one UPDATE (fire-and-forget).
 *
 * @param selectResult - The array the SELECT should resolve with.
 *                       Pass [] to simulate "key not found".
 *                       Pass [{ apiKey, project, organization }] to simulate a match.
 */
function makeApiKeyDb(selectResult: unknown[]) {
  // The UPDATE chain (used to stamp lastUsedAt) is fire-and-forget (void),
  // so we just need it to not throw.
  const updateChain = { set: () => updateChain, where: () => Promise.resolve() };

  // The SELECT chain mimics: .select().from().innerJoin().innerJoin().where().limit()
  const selectChain = {
    from:      () => selectChain,
    innerJoin: () => selectChain,
    where:     () => selectChain,
    limit:     () => Promise.resolve(selectResult),
  };

  return { select: () => selectChain, update: () => updateChain };
}

/**
 * Builds a mock DB suitable for the JWT session auth path.
 * The middleware runs TWO selects in parallel (org + user) via Promise.all.
 * We give each call its own pre-configured result using a call counter.
 *
 * @param orgResult  - Result for the organizations SELECT (first call).
 * @param userResult - Result for the users SELECT (second call).
 */
function makeJwtDb(orgResult: unknown[], userResult: unknown[]) {
  const results = [orgResult, userResult];
  let callCount = 0; // incremented each time select() is called

  return {
    select: () => {
      // Grab the result for this particular call, then advance the counter.
      const result = results[callCount++];
      // Each select() call returns its own chain so the two parallel calls
      // don't interfere with each other.
      const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve(result) };
      return chain;
    },
  };
}

// ─── Test app factory ─────────────────────────────────────────────────────────
// Builds the smallest possible Express app with:
//   1. JSON body parsing
//   2. Cookie parsing (so the middleware can read the `session` cookie)
//   3. The authenticate middleware under test
//   4. A dummy route that echoes req.auth — so we can assert what was set
function buildApp(db: unknown) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Create the real middleware, injecting our fake DB and test secret.
  const authenticate = createAuthMiddleware(db as never, JWT_SECRET);

  // GET /protected — if authenticate calls next(), this handler runs and
  // responds with req.auth. If authenticate rejects, it responds 401/403
  // directly and this handler is never reached.
  app.get("/protected", authenticate, (req, res) => res.json(req.auth));

  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("authenticate middleware", () => {

  // ── API key auth ────────────────────────────────────────────────────────────
  describe("API key auth", () => {
    it("returns 401 when API key is invalid", async () => {
      // DB returns an empty array → no matching key in the database.
      const db = makeApiKeyDb([]);

      // `request(app)` creates a supertest agent.
      // `.get("/protected")` sends a GET request.
      // `.set("X-Api-Key", "bad-key")` adds the header.
      // `await` resolves once the full response arrives.
      const res = await request(buildApp(db)).get("/protected").set("X-Api-Key", "bad-key");

      // The middleware should respond 401 without calling next().
      expect(res.status).toBe(401);
    });

    it("returns 403 for a publishable key", async () => {
      // DB returns a match, but the key type is "publishable".
      // Publishable keys are for client-side use only — not management APIs.
      const db = makeApiKeyDb([
        { apiKey: { ...mockApiKey, type: "publishable" }, project: mockProject, organization: mockOrg },
      ]);

      const res = await request(buildApp(db)).get("/protected").set("X-Api-Key", "vig_pk_abc");
      expect(res.status).toBe(403);
    });

    it("sets req.auth and calls next for a valid secret key", async () => {
      // DB returns a full match with a secret-type key.
      const db = makeApiKeyDb([{ apiKey: mockApiKey, project: mockProject, organization: mockOrg }]);

      const res = await request(buildApp(db)).get("/protected").set("X-Api-Key", "vig_sk_abc");

      // 200 means authenticate called next() and the dummy route responded.
      expect(res.status).toBe(200);
      // The dummy route echoes req.auth, so we can verify what was set.
      expect(res.body.organization.id).toBe("org1");
      expect(res.body.project.id).toBe("p1");
    });
  });

  // ── JWT session auth ─────────────────────────────────────────────────────────
  describe("JWT session auth", () => {
    it("returns 401 when no auth is provided", async () => {
      // No X-Api-Key header, no session cookie → should be rejected.
      const db = makeApiKeyDb([]); // DB won't be called, but we need to pass something
      const res = await request(buildApp(db)).get("/protected");
      expect(res.status).toBe(401);
    });

    it("returns 401 for an invalid JWT token", async () => {
      // "bad.jwt.token" is not a validly signed token — jwt.verify() will throw.
      const db = makeJwtDb([], []);
      const res = await request(buildApp(db)).get("/protected").set("Cookie", "session=bad.jwt.token");
      expect(res.status).toBe(401);
    });

    it("returns 401 when JWT references a deleted user or org", async () => {
      // The token is cryptographically valid (signed with the correct secret),
      // but the DB returns empty results — the user/org was deleted after the
      // token was issued.
      const token = jwt.sign({ userId: "u1", organizationId: "org1" }, JWT_SECRET);
      const db = makeJwtDb([], []); // both selects return empty

      // We set the cookie manually. A real browser would have received it
      // from the login endpoint and sent it back automatically.
      const res = await request(buildApp(db)).get("/protected").set("Cookie", `session=${token}`);
      expect(res.status).toBe(401);
    });

    it("sets req.auth for a valid JWT session", async () => {
      // Sign a valid token with our test secret — same secret the middleware uses.
      const token = jwt.sign({ userId: "u1", organizationId: "org1" }, JWT_SECRET);

      // DB returns the org on the first select and the user on the second.
      const db = makeJwtDb([mockOrg], [mockUser]);

      const res = await request(buildApp(db)).get("/protected").set("Cookie", `session=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.organization.id).toBe("org1");
      expect(res.body.user.id).toBe("u1");
    });
  });
});
