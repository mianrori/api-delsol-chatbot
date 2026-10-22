import { chatService } from "../services/ai/chat.service.js";
import { getValidOracleSession } from "../services/sessions/oracleSession.service.js";

const normalizeIncidencePresentation = (answer) => {
  let text = String(answer ?? "");

  if (!text.includes("## Composición mensual del costo shopping")) {
    return text;
  }

  text = text.replace(
    "| Total costo shopping |",
    "| Costo shopping disponible |",
  );

  const notes = [];

  for (const line of text.split("\n")) {
    if (!/^\|\s*\d{2}\/\d{4}\s*\|/.test(line)) {
      continue;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    const month = cells[0] ?? null;
    const incidence = cells[cells.length - 1] ?? "—";
    const hasMissingConcept = cells.some((cell) => cell === "Sin importe");

    if (
      month &&
      hasMissingConcept &&
      incidence !== "—" &&
      incidence.includes("%")
    ) {
      const note =
        `- **${month}:** la incidencia fue calculada únicamente sobre los conceptos disponibles porque faltan uno o más conceptos oficiales con importe facturado.`;

      if (!text.includes(note)) {
        notes.push(note);
      }
    }
  }

  if (notes.length > 0) {
    text = `${text.trim()}\n${notes.join("\n")}`;
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

  try {
    await getValidOracleSession(sessionId);

    const result = await chatService({
      message,
      sessionId,
    });

    return res.status(200).json({
      env: process.env.NODE_ENV,
      success: true,
      response: normalizeIncidencePresentation(result.answer),
      actions: result.actions ?? {},
    });
  } catch (error) {
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
  }
};
