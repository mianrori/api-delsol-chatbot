import { AsyncLocalStorage } from "node:async_hooks";

const requests = new AsyncLocalStorage();

export const runWithRequestSignal = (signal, callback) => requests.run({ signal }, callback);
export const getRequestSignal = () => requests.getStore()?.signal;
export const throwIfRequestAborted = () => {
  if (getRequestSignal()?.aborted) {
    const error = new Error("La consulta fue cancelada.");
    error.code = "REQUEST_ABORTED";
    throw error;
  }
};

export const isTerminalSessionError = (error) => new Set([
  "ORACLE_SESSION_ID_REQUIRED", "ORACLE_SESSION_NOT_FOUND",
  "ORACLE_SESSION_NOT_ACTIVE", "ORACLE_SESSION_EXPIRED",
  "ORACLE_SESSION_USERNAME_MISSING",
]).has(error?.code);
