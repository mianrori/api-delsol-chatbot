import { oracleSessionsQuery } from "../database/oracleSessions.database.js";
import { getOracleProxyDiagnostic } from "../services/sessions/oracleSession.service.js";

const getHttpStatusByErrorCode = (code) => {
  switch (code) {
    case "ORACLE_SESSION_ID_REQUIRED":
      return 400;
    case "ORACLE_SESSION_NOT_FOUND":
      return 404;
    case "ORACLE_SESSION_NOT_ACTIVE":
    case "ORACLE_SESSION_EXPIRED":
      return 401;
    default:
      return 500;
  }
};

export const healthController = async (_req, res) => {
  try {
    const result = await oracleSessionsQuery(`
      SELECT current_database() AS database_name, NOW() AS server_time
    `);

    return res.status(200).json({
      status: 200,
      env: process.env.NODE_ENV,
      success: true,
      service: "api-delsol-chatbot",
      postgres: result.rows[0],
    });
  } catch (error) {
    console.error("Error en healthcheck:", error);

    return res.status(503).json({
      status: 503,
      env: process.env.NODE_ENV,
      success: false,
      service: "api-delsol-chatbot",
      message: "Servicio no disponible.",
    });
  }
};

export const oracleProxyDiagnosticController = async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({
      status: 404,
      env: process.env.NODE_ENV,
      success: false,
      message: "Recurso no encontrado.",
    });
  }

  const { sessionId } = req.params;

  try {
    const data = await getOracleProxyDiagnostic(sessionId);

    return res.status(200).json({
      status: 200,
      env: process.env.NODE_ENV,
      success: true,
      message: "Sesión Oracle proxy reconstruida desde PostgreSQL.",
      data,
    });
  } catch (error) {
    const status = getHttpStatusByErrorCode(error.code);

    console.error("Error en diagnóstico Oracle proxy:", error);

    return res.status(status).json({
      status,
      env: process.env.NODE_ENV,
      success: false,
      message: status === 500 ? "Error reconstruyendo sesión Oracle." : error.message,
    });
  }
};
