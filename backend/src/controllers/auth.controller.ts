import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { checkAndCreateReward } from "./loyalty.controller";
import {
  buildPasswordResetEmail,
  createPasswordResetToken,
  EmailDeliveryUnavailable,
  hashPasswordResetToken,
  isPasswordResetToken,
  PASSWORD_RESET_TTL_MS,
  PasswordResetError,
  sendPasswordResetEmail,
  validateResetPassword,
} from "../lib/password-reset";

const JWT_SECRET = process.env.JWT_SECRET || "changez-moi-en-production";

if (!process.env.JWT_SECRET) {
  console.warn(
    "[SECURITE] JWT_SECRET n'est pas defini dans l'environnement. " +
    "Un secret par defaut non securise est utilise pour signer les tokens. " +
    "Definissez JWT_SECRET dans .env (local) et dans les variables d'environnement Render (production)."
  );
}

// Precomputed once at startup so that login() always pays the same bcrypt
// cost whether the email exists or not — otherwise the response-time
// difference between "user not found" (instant) and "user found, wrong
// password" (one bcrypt.compare) lets an attacker enumerate valid emails.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("foodsave-timing-safety-placeholder", 10);

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, referralCode } = req.body || {};

    if ([email, password, firstName, lastName].some(value => typeof value !== "string" || !value)) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    if (!firstName.trim() || !lastName.trim() || firstName.length > 100 || lastName.length > 100) {
      return res.status(400).json({ message: "auth.invalidNames" });
    }
    // Validate, but never canonicalize or silently trim stored email identities.
    const emailParts = email.split("@");
    const local = emailParts[0];
    const domain = emailParts[1] || "";
    const validLocal = local.length <= 64 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
      && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..");
    const validDomain = domain.includes(".") && domain.split(".").every((label: string) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
    if (email.length > 254 || email !== email.trim() || emailParts.length !== 2 || !validLocal || !validDomain) {
      return res.status(400).json({ message: "auth.invalidEmail" });
    }
    const passwordBytes = Buffer.byteLength(password, "utf8");
    if (passwordBytes < 8 || passwordBytes > 72) {
      return res.status(400).json({ message: "auth.invalidPasswordLength" });
    }
    if (referralCode !== undefined && typeof referralCode !== "string") {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const existingUser = await prisma.user.findUnique({ where: { canonicalEmail: email.toLowerCase() } });
    if (existingUser) {
      console.warn("[AUTH_REGISTER_DIAG] DUPLICATE_PRECHECK");
      try {
        const [metadata] = await prisma.$queryRaw<Array<{ database: string; user: string; schema: string; oid: number }>>`
          SELECT current_database() AS database, current_user AS user, current_schema() AS schema, pg_database.oid AS oid
          FROM pg_database
          WHERE pg_database.datname = current_database()
        `;
        const safe = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.-]+$/.test(value);
        if (metadata && safe(metadata.database) && safe(metadata.user) && safe(metadata.schema) && Number.isInteger(metadata.oid) && metadata.oid >= 0) {
          console.warn(`[AUTH_REGISTER_DIAG] DB database=${metadata.database} user=${metadata.user} schema=${metadata.schema} oid=${metadata.oid}`);
        } else {
          console.warn("[AUTH_REGISTER_DIAG] DB_METADATA_UNAVAILABLE");
        }
      } catch {
        console.warn("[AUTH_REGISTER_DIAG] DB_METADATA_UNAVAILABLE");
      }
      return res.status(400).json({ message: "Cet email est deja utilise" });
    }

    let referredById: string | null = null;

    if (referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode } });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        canonicalEmail: email.toLowerCase(),
        password: hashedPassword,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: role === "MERCHANT" ? "MERCHANT" : "CLIENT",
        referredById,
      },
    });

    const token = jwt.sign({ userId: user.id, role: user.role, authVersion: user.authVersion }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "Compte cree avec succes",
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      const target = error.meta?.target;
      const targetText = Array.isArray(target) ? target.join(",") : target;
      if (typeof targetText === "string" && /^[A-Za-z0-9_.-]+(?:,[A-Za-z0-9_.-]+)*$/.test(targetText)) {
        console.warn(`[AUTH_REGISTER_DIAG] PRISMA_P2002 target=${targetText}`);
      } else {
        console.warn("[AUTH_REGISTER_DIAG] PRISMA_P2002");
      }
      // Two concurrent registrations with the same email both passed the
      // findUnique check above before either insert committed; the unique
      // constraint on User.email is the real guard, this just returns the
      // same friendly message instead of a generic 500.
      return res.status(400).json({ message: "Cet email est deja utilise" });
    }
    console.error("[AUTH_REGISTER] registration failed");
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const isPasswordValid = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);

    if (!user?.password || !isPasswordValid) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" });
    }

    const token = jwt.sign({ userId: user.id, role: user.role, authVersion: user.authVersion }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Connexion reussie",
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

const neutralResetResponse = (res: Response) => res.json({ message: "auth.resetRequestAccepted" });

export const forgotPassword = async (req: Request, res: Response) => {
  const { email, locale } = req.body || {};
  if (typeof email !== "string" || !email || email.length > 254) return neutralResetResponse(res);

  try {
    const user = await prisma.user.findUnique({ where: { canonicalEmail: email.toLowerCase() } });
    if (!user?.password) return neutralResetResponse(res);

    const rawToken = createPasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    const record = await prisma.passwordResetToken.create({
      data: { tokenHash: hashPasswordResetToken(rawToken), userId: user.id, expiresAt },
    });
    try {
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const resetUrl = new URL("/reset-password", baseUrl);
      resetUrl.searchParams.set("token", rawToken);
      await sendPasswordResetEmail(user.email, buildPasswordResetEmail({
        resetUrl: resetUrl.toString(),
        locale: locale === "en" ? "en" : "fr",
        expiresMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
      }));
    } catch (error) {
      await prisma.passwordResetToken.delete({ where: { id: record.id } });
      if (!(error instanceof EmailDeliveryUnavailable)) console.error("Password reset email delivery failed");
    }
  } catch (error) {
    console.error("Password reset request failed", error instanceof Error ? error.message : "unknown error");
  }
  return neutralResetResponse(res);
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password, confirmPassword } = req.body || {};
  if (!isPasswordResetToken(token)) return res.status(400).json({ message: "auth.resetInvalid" });
  if (password !== confirmPassword) return res.status(400).json({ message: "auth.resetPasswordMismatch" });
  const passwordError = validateResetPassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashPasswordResetToken(token) } });
      if (!record) throw new PasswordResetError("auth.resetInvalid");
      if (record.usedAt) throw new PasswordResetError("auth.resetUsed");
      if (record.expiresAt <= new Date()) throw new PasswordResetError("auth.resetExpired");

      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new PasswordResetError("auth.resetUsed");

      await tx.user.update({
        where: { id: record.userId },
        data: { password: await bcrypt.hash(password, 10), authVersion: { increment: 1 } },
      });
    });
    return res.json({ message: "auth.resetSuccess" });
  } catch (error) {
    if (error instanceof PasswordResetError) return res.status(400).json({ message: error.code });
    console.error("Password reset failed", error instanceof Error ? error.message : "unknown error");
    return res.status(500).json({ message: "ui.unable_to_contact_the_server" });
  }
};
