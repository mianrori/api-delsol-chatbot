import { clearPiiSession } from "./pii.store.js";

const conversations = new Map();

export const getConversation = (sessionId) => {
  return conversations.get(sessionId) ?? [];
};

export const setConversation = (sessionId, messages) => {
  conversations.set(sessionId, messages);
};

export const clearConversation = (sessionId) => {
  conversations.delete(sessionId);
  clearPiiSession(sessionId);
};
