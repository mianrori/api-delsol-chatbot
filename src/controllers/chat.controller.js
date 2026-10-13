import { chatService } from "../services/ai/chat.service.js";
import { getValidOracleSession } from "../services/sessions/oracleSession.service.js";

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
      response: result.answer,
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
