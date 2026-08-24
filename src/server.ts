import express from "express";
import dotenv from "dotenv";

import campaignRoutes from "./routes/campaigns";

dotenv.config();

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.use("/campaigns", campaignRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
