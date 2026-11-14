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

