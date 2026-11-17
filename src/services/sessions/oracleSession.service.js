import { connectWithProxy } from "../../database/oracle.database.js";
import { randomUUID } from "node:crypto";
import { throwIfRequestAborted } from "../requestContext.service.js";
import {
  getOracleSessionRepository,
  touchOracleSessionRepository,
} from "../../repositories/sessions/oracleSession.repository.js";

const normalizeSessionId = (sessionId) => String(sessionId ?? "").trim();
const normalizeUsername = (username) => String(username ?? "").trim().toUpperCase();

const closeProxyConnection = async (connection, correlationId) => {
  try {
    await connection.close();
  } catch (error) {
    const driverCode = typeof error?.code === "string" && /^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(error.code)
      ? error.code
      : Number.isSafeInteger(error?.errorNum) && error.errorNum > 0 && error.errorNum <= 99999
        ? `ORA-${String(error.errorNum).padStart(5, "0")}` : "ORACLE_CLOSE_ERROR_UNCLASSIFIED";
    console.error({ correlationId, code: "ORACLE_PROXY_CLOSE_FAILED", driverCode });
  }
};

const createSessionError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export const getValidOracleSession = async (sessionId) => {
  const normalizedSessionId = normalizeSessionId(sessionId);

  if (!normalizedSessionId) {
    throw createSessionError(
      "ORACLE_SESSION_ID_REQUIRED",
      "El sessionId es obligatorio.",
    );
  }

  const session = await getOracleSessionRepository(normalizedSessionId);

  if (!session) {
    throw createSessionError(
      "ORACLE_SESSION_NOT_FOUND",
      "Sesión Oracle no encontrada.",
    );
  }

  if (session.status !== "ACTIVE") {
    throw createSessionError(
      "ORACLE_SESSION_NOT_ACTIVE",
      "La sesión Oracle no está activa.",
    );
  }

  if (
    session.expires_at &&
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    throw createSessionError(
      "ORACLE_SESSION_EXPIRED",
      "La sesión Oracle ha expirado.",
    );
  }

  const username = normalizeUsername(session.username);

  if (!username) {
    throw createSessionError(
      "ORACLE_SESSION_USERNAME_MISSING",
      "La sesión Oracle no tiene un username válido.",
    );
  }

  return {
    ...session,
    username,
  };
};

export const createProxyConnectionBySessionId = async (sessionId) => {
  throwIfRequestAborted();
  const session = await getValidOracleSession(sessionId);
  throwIfRequestAborted();
  const correlationId = randomUUID();
  const connection = await connectWithProxy(session.username);
  try {
    throwIfRequestAborted();
    await touchOracleSessionRepository(session.session_id);
    throwIfRequestAborted();
  } catch (error) {
    await closeProxyConnection(connection, correlationId);
    throw error;
  }

  return {
    connection,
    correlationId,
    sessionId: session.session_id,
    username: session.username,
  };
};

export const withOracleProxySession = async (sessionId, callback) => {
  const context = await createProxyConnectionBySessionId(sessionId);

  try {
    throwIfRequestAborted();
    return await callback(context);
  } finally {
    await closeProxyConnection(context.connection, context.correlationId);
  }
};

export const getOracleProxyDiagnostic = async (sessionId) => {
  return withOracleProxySession(sessionId, async ({ connection, username }) => {
    const identityResult = await connection.execute(`
      SELECT
        USER AS oracle_user,
        SYS_CONTEXT('USERENV', 'SESSION_USER') AS session_user,
        SYS_CONTEXT('USERENV', 'PROXY_USER') AS proxy_user
      FROM dual
    `);

    const rolesResult = await connection.execute(`
      SELECT role
      FROM session_roles
      ORDER BY role
    `);

    return {
      username,
      oracleIdentity: identityResult.rows?.[0] ?? null,
      roles: (rolesResult.rows ?? []).map((row) => row.ROLE),
    };
  });
};
