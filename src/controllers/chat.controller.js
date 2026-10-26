import { chatService } from "../services/ai/chat.service.js";
import { getValidOracleSession } from "../services/sessions/oracleSession.service.js";
import { runWithRequestSignal, throwIfRequestAborted } from "../services/requestContext.service.js";

const parseParaguayanNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\*\*/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const normalizeIncidencePresentation = (answer) => {
  let text = String(answer ?? "");

  if (!text.includes("## Composición mensual del costo shopping")) {
    return text;
  }

  text = text.replace(
    "| Total costo shopping |",
    "| Costo shopping disponible |",
  );

  const rows = [];

  for (const line of text.split("\n")) {
    if (!/^\|\s*\d{2}\/\d{4}\s*\|/.test(line)) {
      continue;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    rows.push({
      month: cells[0] ?? null,
      sales: parseParaguayanNumber(cells[cells.length - 2]),
      incidence: parseParaguayanNumber(cells[cells.length - 1]),
      hasMissingConcept: cells.some((cell) => cell === "Sin importe"),
    });
  }

  const observationsIndex = text.indexOf("\n\n**Observaciones:**");

  if (observationsIndex >= 0) {
    text = text.slice(0, observationsIndex).trim();
  }

  const analysis = [];
  const rowsWithIncidence = rows.filter((row) => row.incidence !== null);
  const rowsWithoutSales = rows.filter((row) => Number(row.sales ?? 0) === 0);

  if (rowsWithIncidence.length > 0) {
    const highest = [...rowsWithIncidence].sort(
      (a, b) => b.incidence - a.incidence,
    )[0];

    analysis.push(
      `La mayor incidencia del período se registró en **${highest.month}**, con **${new Intl.NumberFormat("es-PY", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(highest.incidence)} %**.`,
    );
  }

  if (rowsWithoutSales.length > 0) {
    analysis.push(
      `No se registraron ventas auditadas en **${rowsWithoutSales
        .map((row) => row.month)
        .join(" y ")}**, por lo que no corresponde calcular incidencia en esos meses.`,
    );
  }

  if (rows.some((row) => row.hasMissingConcept)) {
    analysis.push(
      "Los porcentajes de incidencia corresponden al **costo shopping disponible**, ya que no se dispone del importe de todos los conceptos oficiales en los meses analizados.",
    );
  }

  if (analysis.length > 0) {
    text = `${text}\n\n## Análisis\n\n${analysis.join(" ")}`;
  }

  return text;
};

const getSessionHttpStatus = (code) => {
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

export const chatController = async (req, res) => {
  const { message, sessionId } = req.body ?? {};

  if (!message?.trim()) {
    return res.status(400).json({
      env: process.env.NODE_ENV,
      success: false,
      message: "El mensaje es obligatorio.",
    });
  }

  if (!sessionId) {
    return res.status(400).json({
      env: process.env.NODE_ENV,
      success: false,
      message: "El sessionId es obligatorio.",
    });
  }

  const cancellation = new AbortController();
  const onAborted = () => cancellation.abort();
  const onClosed = () => {
    if (!res.writableEnded) cancellation.abort();
  };
  req.once("aborted", onAborted);
  res.once("close", onClosed);
  if (req.aborted || res.destroyed) cancellation.abort();

  try {
    const result = await runWithRequestSignal(cancellation.signal, async () => {
      throwIfRequestAborted();
      await getValidOracleSession(sessionId);
      throwIfRequestAborted();
      return chatService({ message, sessionId });
    });
    if (cancellation.signal.aborted) return;

    return res.status(200).json({
      env: process.env.NODE_ENV,
      success: true,
      response: normalizeIncidencePresentation(result.answer),
      actions: result.actions ?? {},
    });
  } catch (error) {
    if (cancellation.signal.aborted || error.code === "REQUEST_ABORTED") return;
    const sessionStatus = getSessionHttpStatus(error.code);

    if (sessionStatus !== 500) {
      return res.status(sessionStatus).json({
        env: process.env.NODE_ENV,
        success: false,
        message: error.message,
      });
    }

    console.error("Error en chatController:", error);

    return res.status(500).json({
      env: process.env.NODE_ENV,
      success: false,
      message: "Ocurrió un error procesando la consulta.",
    });
  } finally {
    req.removeListener("aborted", onAborted);
    res.removeListener("close", onClosed);
  }
};
