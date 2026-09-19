import { createHash, randomBytes } from "crypto";

export const PASSWORD_RESET_TTL_MS = 45 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class PasswordResetError extends Error {
  constructor(public code: "auth.resetInvalid" | "auth.resetExpired" | "auth.resetUsed") {
    super(code);
  }
}

export class EmailDeliveryUnavailable extends Error {
  constructor() {
    super("Password reset email delivery is not configured");
  }
}

export function createPasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isPasswordResetToken(value: unknown): value is string {
  return typeof value === "string" && PASSWORD_RESET_TOKEN_PATTERN.test(value);
}

export function validateResetPassword(password: unknown): "auth.invalidPasswordLength" | null {
  if (typeof password !== "string") return "auth.invalidPasswordLength";
  const bytes = Buffer.byteLength(password, "utf8");
  return bytes >= 8 && bytes <= 72 ? null : "auth.invalidPasswordLength";
}

export function buildPasswordResetEmail(input: {
  resetUrl: string;
  locale: "fr" | "en";
  expiresMinutes: number;
}): { subject: string; text: string } {
  if (input.locale === "fr") {
    return {
      subject: "Réinitialisez votre mot de passe FoodSave",
      text: `Utilisez ce lien FoodSave pour réinitialiser votre mot de passe : ${input.resetUrl}\n\nCe lien expire dans ${input.expiresMinutes} minutes et ne peut être utilisé qu'une seule fois.`,
    };
  }
  return {
    subject: "Reset your FoodSave password",
    text: `Use this FoodSave link to reset your password: ${input.resetUrl}\n\nThis link expires in ${input.expiresMinutes} minutes and can only be used once.`,
  };
}

export async function sendPasswordResetEmail(_to: string, _email: { subject: string; text: string }): Promise<void> {
  // The audit found no configured transactional email provider. Keep this boundary
  // explicit so the application fails closed until a provider is configured.
  throw new EmailDeliveryUnavailable();
}
