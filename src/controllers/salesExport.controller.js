import { buildSalesExcel } from "../services/exports/salesExport.service.js";
import { withOracleProxySession } from "../services/sessions/oracleSession.service.js";

export const downloadSalesExcelController = async (req, res) => {
  try {
    const { exportId, sessionId } = req.params;

    if (!exportId) {
      return res.status(400).json({
        env: process.env.NODE_ENV,
        success: false,
        message: "El exportId es obligatorio.",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        env: process.env.NODE_ENV,
        success: false,
        message: "El sessionId es obligatorio.",
      });
    }

    const { workbook, fileName } = await withOracleProxySession(
      sessionId,
      ({ connection, username }) =>
        buildSalesExcel({
          exportId,
          username,
          connection,
        }),
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`,
    );
    res.setHeader("Cache-Control", "no-store");

    await workbook.xlsx.write(res);

    return res.end();
  } catch (error) {
    console.error("Error en downloadSalesExcelController:", error);

    if (!res.headersSent) {
      const statusCode =
        error?.code === "EXPORT_NOT_FOUND"
          ? 404
          : error?.code === "EXPORT_EXPIRED"
            ? 410
            : error?.code === "EXPORT_FORBIDDEN"
              ? 403
              : [
                    "ORACLE_SESSION_NOT_FOUND",
                    "ORACLE_SESSION_NOT_ACTIVE",
                    "ORACLE_SESSION_EXPIRED",
                  ].includes(error?.code)
                ? 401
                : 500;

      return res.status(statusCode).json({
        env: process.env.NODE_ENV,
        success: false,
        message:
          error?.message ?? "Ocurrió un error generando el archivo Excel.",
      });
    }

    return res.end();
  }
};
