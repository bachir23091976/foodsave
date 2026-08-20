// Must be the very first import. TypeScript compiles `import` statements to
// `require()` calls in source order, and every route below transitively
// imports a controller/lib module that reads `process.env.*` at module load
// time (JWT_SECRET in auth.controller.ts/auth.middleware.ts,
// STRIPE_SECRET_KEY in lib/stripe.ts, DATABASE_URL via lib/prisma.ts's
// `new PrismaClient()`). If dotenv.config() ran after those imports (as it
// did before this fix), all of them would capture `undefined` for any var
// that only exists in .env — permanently, since those are top-level
// `const`s evaluated once. `import "dotenv/config"` runs as soon as this
// line is reached, before any later import, guaranteeing .env is loaded
// first. This only matters for local dev: on Render, env vars are injected
// into process.env before Node even starts, so this was invisible there.
import "dotenv/config";

import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import merchantRoutes from "./routes/merchant.routes";
import offerRoutes from "./routes/offer.routes";
import orderRoutes from "./routes/order.routes";
import adminRoutes from "./routes/admin.routes";
import notificationRoutes from "./routes/notification.routes";
import locationRoutes from "./routes/location.routes";
import userRoutes from "./routes/user.routes";
import favoriteRoutes from "./routes/favorite.routes";
import loyaltyRoutes from "./routes/loyalty.routes";
import uploadRoutes from "./routes/upload.routes";

const app = express();
const PORT = process.env.PORT || 4000;

// Render (like most PaaS) sits behind a reverse proxy and sets X-Forwarded-For.
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// because it can't safely derive the real client IP from the proxy chain.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/merchants", merchantRoutes);
app.use("/offers", offerRoutes);
app.use("/orders", orderRoutes);
app.use("/admin", adminRoutes);
app.use("/notifications", notificationRoutes);
app.use("/locations", locationRoutes);
app.use("/users", userRoutes);
app.use("/favorites", favoriteRoutes);
app.use("/loyalty", loyaltyRoutes);
app.use("/upload", uploadRoutes);

app.get("/", (req, res) => {
  res.json({ message: "FoodSave API is running" });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
