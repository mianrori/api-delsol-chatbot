import express from "express";
import {
  healthController,
  oracleProxyDiagnosticController,
} from "../controllers/health.controller.js";

export const router = express.Router();

router.get("/health", healthController);
router.get("/health/oracle/:sessionId", oracleProxyDiagnosticController);
