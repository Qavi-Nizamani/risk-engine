import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { WebhookEndpointLookupRepository } from "../repositories/webhookEndpoint.repository";

function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // Normalise: strip a leading "sha256=" prefix if the sender includes it (e.g. GitHub),
  // then compare the plain hex digests. Lemon Squeezy sends the raw hex with no prefix.
  const normalised = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(normalised);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

export function createWebhookTokenAuthMiddleware(
  repo: WebhookEndpointLookupRepository,
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { token } = req.params;

    if (!token) {
      res.status(401).json({ message: "Webhook token is required" });
      return;
    }

    const result = await repo.findByToken(token);

    if (!result) {
      res.status(401).json({ message: "Invalid webhook token" });
      return;
    }

    const signature = req.headers["x-signature"];

    if (!signature || typeof signature !== "string") {
      res.status(401).json({ message: "X-Signature header is required" });
      return;
    }

    const rawBody = req.body as Buffer;

    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ message: "Request body is required" });
      return;
    }

    if (!verifyWebhookSignature(rawBody, signature, result.endpoint.secret)) {
      res.status(401).json({ message: "Invalid webhook signature" });
      return;
    }

    req.auth = {
      organization: result.organization,
      project: result.project,
      webhookEndpoint: result.endpoint,
    };

    next();
  };
}
