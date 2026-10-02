import express from "express";
import {
  healthController,
  oracleProxyDiagnosticController,
} from "../controllers/health.controller.js";
import { chatController } from "../controllers/chat.controller.js";

export const router = express.Router();

router.get("/health", healthController);
router.get("/health/oracle/:sessionId", oracleProxyDiagnosticController);
router.post("/bot/chat", chatController);
