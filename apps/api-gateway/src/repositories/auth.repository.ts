import { eq } from "drizzle-orm";
import { getDb, users, emailVerificationTokens, passwordResetTokens } from "@risk-engine/db";
import type { User, EmailVerificationToken, PasswordResetToken } from "@risk-engine/db";

type Db = ReturnType<typeof getDb>;

export class AuthRepository {
  constructor(private readonly db: Db) {}

  async findUserByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return user ?? null;
  }

  async createUser(data: { email: string; name: string; passwordHash: string }): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash,
      })
      .returning();
    return user;
  }

  async findUserById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async createVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    // Remove any existing token for this user before inserting a fresh one
    await this.db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));

    await this.db.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt });
  }

  async findVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null> {
    const [row] = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async findVerificationTokenByUserId(userId: string): Promise<EmailVerificationToken | null> {
    const [row] = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async deleteVerificationToken(id: string): Promise<void> {
    await this.db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, id));
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));

    await this.db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
  }

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async deletePasswordResetToken(id: string): Promise<void> {
    await this.db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, id));
  }
}
