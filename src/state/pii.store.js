const piiSessions = new Map();

const createSessionState = () => ({
  counters: new Map(),
  valueToToken: new Map(),
  tokenToValue: new Map(),
});

export const getPiiSession = (sessionId) => {
  if (!piiSessions.has(sessionId)) {
    piiSessions.set(sessionId, createSessionState());
  }

  return piiSessions.get(sessionId);
};

export const clearPiiSession = (sessionId) => {
  piiSessions.delete(sessionId);
};
