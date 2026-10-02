import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";

import config from "./config.js";
import { router } from "./src/routes/index.js";
import { closeOracleSessionsPool } from "./src/database/oracleSessions.database.js";

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors());

app.use("/chatbot/api", router);

let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.info(`${signal} recibido. Cerrando API-DELSOL-CHATBOT...`);

  server.close(async () => {
    try {
      await closeOracleSessionsPool();
      console.info("API-DELSOL-CHATBOT detenida correctamente.");
      process.exit(0);
    } catch (error) {
      console.error("Error durante el apagado del chatbot:", error);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(config.port, () => {
  console.log(
    `Server API-DELSOL-CHATBOT running on port ${config.port} in ${config.env} mode.`,
  );
});
