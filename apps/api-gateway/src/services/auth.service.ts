import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { User, Organization } from "@risk-engine/db";
import { ConflictError, UnauthorizedError, BadRequestError, ForbiddenError } from "@risk-engine/http";
import { sendEmail, buildVerifyEmail, buildResetPasswordEmail } from "@risk-engine/email";
import type { AuthRepository } from "../repositories/auth.repository";
import type { OrganizationRepository } from "../repositories/organization.repository";
import type { SubscriptionService } from "./subscription.service";

export interface JwtPayload {
  userId: string;
  organizationId: string;
}

export interface SignupInput {
  email: string;
  name: string;
  password: string;
  orgName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

export class AuthService {
  constructor(
    private readonly userRepo: AuthRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly jwtSecret: string,
    private readonly signupDisabled: boolean = false,
    private readonly dashboardUrl: string = "http://localhost:3000",
    private readonly subscriptionService?: SubscriptionService,
  ) {}

  get cookieMaxAge(): number {
    return COOKIE_MAX_AGE_MS;
  }

  private sign(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: "7d" });
  }

  async signup(input: SignupInput): Promise<{ message: string }> {
    if (this.signupDisabled) {
      throw new ForbiddenError("Signup is currently disabled");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email)) {
      throw new BadRequestError("Invalid email address");
    }
    if (input.password.length < 8) {
      throw new BadRequestError("Password must be at least 8 characters");
    }

    const existing = await this.userRepo.findUserByEmail(input.email);
    if (existing) throw new ConflictError("Email already registered");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.userRepo.createUser({
      email: input.email,
      name: input.name,
      passwordHash,
    });

    const org = await this.orgRepo.create({ name: input.orgName });
    await this.orgRepo.addMember({ organizationId: org.id, userId: user.id, role: "OWNER" });

    // Assign free plan subscription
    await this.subscriptionService?.assignFreePlan(org.id);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);
    await this.userRepo.createVerificationToken(user.id, tokenHash, expiresAt);

    const verificationUrl = `${this.dashboardUrl}/verify-email?token=${rawToken}`;
    const { subject, html } = buildVerifyEmail({ recipientName: user.name, verificationUrl });
    await sendEmail({ to: user.email, subject, html });

    return { message: "Check your email to verify your account" };
  }

  async verifyEmail(rawToken: string): Promise<{
    user: Pick<User, "id" | "email" | "name">;
    organization: Pick<Organization, "id" | "name" | "plan">;
    token: string;
  }> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const record = await this.userRepo.findVerificationToken(tokenHash);

    if (!record) {
      throw new BadRequestError("Invalid or expired verification link");
    }

    if (record.expiresAt < new Date()) {
      await this.userRepo.deleteVerificationToken(record.id);
      throw new BadRequestError("Verification link has expired");
    }

    await this.userRepo.markEmailVerified(record.userId);
    await this.userRepo.deleteVerificationToken(record.id);

    const user = await this.userRepo.findUserById(record.userId);
    if (!user) throw new BadRequestError("User not found");

    const membership = await this.orgRepo.findFirstMembership(user.id);
    if (!membership) throw new BadRequestError("Organization not found");

    const token = this.sign({ userId: user.id, organizationId: membership.org.id });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.org.id,
        name: membership.org.name,
        plan: membership.org.plan,
      },
      token,
    };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.userRepo.findUserByEmail(email);

    if (!user) throw new BadRequestError("No account found with this email");
    if (user.emailVerified) throw new BadRequestError("This email is already verified");

    const existing = await this.userRepo.findVerificationTokenByUserId(user.id);
    if (existing) {
      const elapsed = Date.now() - existing.createdAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        throw new BadRequestError(`Please wait ${waitSeconds} seconds before requesting another email`);
      }
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);
    await this.userRepo.createVerificationToken(user.id, tokenHash, expiresAt);

    const verificationUrl = `${this.dashboardUrl}/verify-email?token=${rawToken}`;
    const { subject, html } = buildVerifyEmail({ recipientName: user.name, verificationUrl });
    await sendEmail({ to: user.email, subject, html });

    return { message: "Verification email resent" };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userRepo.findUserByEmail(email);

    // Always return the same message to prevent email enumeration
    const message = "If an account exists for that email, a reset link has been sent";

    if (!user || !user.emailVerified) {
      return { message };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
    await this.userRepo.createPasswordResetToken(user.id, tokenHash, expiresAt);

    const resetUrl = `${this.dashboardUrl}/reset-password?token=${rawToken}`;
    const { subject, html } = buildResetPasswordEmail({ recipientName: user.name, resetUrl });
    await sendEmail({ to: user.email, subject, html });

    return { message };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<{ message: string }> {
    if (newPassword.length < 8) {
      throw new BadRequestError("Password must be at least 8 characters");
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const record = await this.userRepo.findPasswordResetToken(tokenHash);

    if (!record) {
      throw new BadRequestError("Invalid or expired reset link");
    }

    if (record.expiresAt < new Date()) {
      await this.userRepo.deletePasswordResetToken(record.id);
      throw new BadRequestError("Reset link has expired");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.updateUserPassword(record.userId, passwordHash);
    await this.userRepo.deletePasswordResetToken(record.id);

    return { message: "Password updated successfully" };
  }

  async login(input: LoginInput): Promise<{
    user: Pick<User, "id" | "email" | "name">;
    organization: Pick<Organization, "id" | "name" | "plan">;
    token: string;
  }> {
    const user = await this.userRepo.findUserByEmail(input.email);
    if (!user) throw new UnauthorizedError("Invalid email or password");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Invalid email or password");

    if (!user.emailVerified) {
      throw new UnauthorizedError("Please verify your email before logging in");
    }

    const membership = await this.orgRepo.findFirstMembership(user.id);
    if (!membership) throw new UnauthorizedError("User has no organization");

    const token = this.sign({ userId: user.id, organizationId: membership.org.id });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.org.id,
        name: membership.org.name,
        plan: membership.org.plan,
      },
      token,
    };
  }
}
