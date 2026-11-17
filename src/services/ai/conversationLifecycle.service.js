import { clearConversation } from "../../state/conversation.store.js";
import { getValidOracleSession } from "../sessions/oracleSession.service.js";

// The store is process-local, as is this guard. A reset must never race with
// an active response that would recreate history or change the PII dictionary.
const activeConversations = new Set();

export const withConversationOperation = async (sessionId, operation) => {
  if (activeConversations.has(sessionId)) {
    throw Object.assign(new Error("Hay una consulta en curso. Espera a que termine o cancélala antes de continuar."), {
      code: "CONVERSATION_BUSY",
    });
  }
  activeConversations.add(sessionId);
  try {
    return await operation();
  } finally {
    activeConversations.delete(sessionId);
  }
};

export const resetConversation = (sessionId) => withConversationOperation(sessionId, async () => {
  await getValidOracleSession(sessionId);
  clearConversation(sessionId);
});
