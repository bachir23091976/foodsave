import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "changez-moi-en-production";

export interface AuthRequest extends Request {
  userId?: string;
  role?: string;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Non autorisé" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    req.userId = decoded.userId;
    req.role = decoded.role;
    next();
  } catch (error: any) {
    // Server-side only — never sent to the client. jsonwebtoken's error
    // name distinguishes a malformed token (wrong number of "." segments,
    // usually a truncated/corrupted value on the client) from an expired
    // token or a signature mismatch (usually JWT_SECRET drift between the
    // process that signed it and this one).
    console.error(`[auth] jwt.verify a echoue: ${error?.name || "?"} - ${error?.message || "?"}`);
    return res.status(401).json({ message: "Jeton invalide" });
  }
};
