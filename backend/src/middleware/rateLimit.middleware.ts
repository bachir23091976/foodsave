import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Trop de tentatives, veuillez reessayer dans 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

// A Google round trip uses four requests; keep its budget separate from passwords.
export const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "auth.googleUnavailable" },
  standardHeaders: true,
  legacyHeaders: false,
});
