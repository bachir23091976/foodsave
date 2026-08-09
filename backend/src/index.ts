import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

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

app.get("/", (req, res) => {
  res.json({ message: "FoodSave API is running" });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});