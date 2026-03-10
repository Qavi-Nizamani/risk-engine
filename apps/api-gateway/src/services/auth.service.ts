import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { User, Organization } from "@risk-engine/db";
import { ConflictError, UnauthorizedError, BadRequestError, ForbiddenError } from "@risk-engine/http";
import type { AuthRepository } from "../repositories/auth.repository";
import type { OrganizationRepository } from "../repositories/organization.repository";

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

export class AuthService {
  constructor(
    private readonly userRepo: AuthRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly jwtSecret: string,
    private readonly signupDisabled: boolean = false,
  ) {}

  get cookieMaxAge(): number {
    return COOKIE_MAX_AGE_MS;
  }

  private sign(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: "7d" });
  }

  async signup(input: SignupInput): Promise<{
    user: Pick<User, "id" | "email" | "name">;
    organization: Pick<Organization, "id" | "name" | "plan">;
    token: string;
  }> {
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

    const token = this.sign({ userId: user.id, organizationId: org.id });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organization: { id: org.id, name: org.name, plan: org.plan },
      token,
    };
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
