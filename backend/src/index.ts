import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import merchantRoutes from "./routes/merchant.routes";
import offerRoutes from "./routes/offer.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/merchants", merchantRoutes);
app.use("/offers", offerRoutes);

app.get("/", (req, res) => {
  res.json({ message: "FoodSave API is running" });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});