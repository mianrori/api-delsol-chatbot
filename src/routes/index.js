import express from "express";
import {
  healthController,
  oracleProxyDiagnosticController,
} from "../controllers/health.controller.js";
import { chatController, resetConversationController } from "../controllers/chat.controller.js";
import { downloadSalesExcelController } from "../controllers/salesExport.controller.js";

export const router = express.Router();

router.get("/health", healthController);
router.get("/health/oracle/:sessionId", oracleProxyDiagnosticController);
router.post("/bot/chat", chatController);
router.post("/bot/chat/reset", resetConversationController);
router.get(
  "/bot/exports/sales/:exportId/:sessionId",
  downloadSalesExcelController,
);
