import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { checkAndCreateReward } from "./loyalty.controller";

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
    const { email, password, firstName, lastName, role, referralCode } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
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
        password: hashedPassword,
        firstName,
        lastName,
        role: role === "MERCHANT" ? "MERCHANT" : "CLIENT",
        referredById,
      },
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
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
      // Two concurrent registrations with the same email both passed the
      // findUnique check above before either insert committed; the unique
      // constraint on User.email is the real guard, this just returns the
      // same friendly message instead of a generic 500.
      return res.status(400).json({ message: "Cet email est deja utilise" });
    }
    console.error(error);
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
    const isPasswordValid = await bcrypt.compare(password, user ? user.password : DUMMY_PASSWORD_HASH);

    if (!user || !isPasswordValid) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
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
