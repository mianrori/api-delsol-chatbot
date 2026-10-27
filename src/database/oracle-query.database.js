import { getRequestSignal, throwIfRequestAborted } from "../services/requestContext.service.js";

export const executeOracleQuery = async (connection, sql, binds = {}) => {
  throwIfRequestAborted();
  const signal = getRequestSignal();
  let breaking;
  const onAbort = () => {
    if (process.env.NODE_ENV === "development") console.log("[CHATBOT-DEV] ORACLE QUERY CANCEL REQUESTED");
    // Wait for break to finish before the caller may close/reuse the connection.
    breaking ??= Promise.resolve().then(() => connection.break()).then(() => {
      if (process.env.NODE_ENV === "development") console.log("[CHATBOT-DEV] ORACLE QUERY CANCEL FINISHED");
    }).catch((error) => {
      console.error("No se pudo interrumpir la consulta Oracle:", error?.message);
    });
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const normalizedSql = String(sql ?? "").replace(/;\s*$/, "").trim();
    const result = await connection.execute(normalizedSql, binds);
    throwIfRequestAborted();

    return Array.isArray(result.rows) ? result.rows : [];
  } catch (error) {
    throwIfRequestAborted();
    console.error("Error ejecutando consulta Oracle:", error?.message ?? error);

    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await breaking;
  }
};
