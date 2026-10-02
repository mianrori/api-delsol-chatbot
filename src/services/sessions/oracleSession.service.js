import { connectWithProxy } from "../../database/oracle.database.js";
import {
  getOracleSessionRepository,
  touchOracleSessionRepository,
} from "../../repositories/sessions/oracleSession.repository.js";

const normalizeSessionId = (sessionId) => String(sessionId ?? "").trim();
const normalizeUsername = (username) => String(username ?? "").trim().toUpperCase();

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
  const session = await getValidOracleSession(sessionId);
  const connection = await connectWithProxy(session.username);

  await touchOracleSessionRepository(session.session_id);

  return {
    connection,
    sessionId: session.session_id,
    username: session.username,
  };
};

export const withOracleProxySession = async (sessionId, callback) => {
  const context = await createProxyConnectionBySessionId(sessionId);

  try {
    return await callback(context);
  } finally {
    try {
      await context.connection.close();
    } catch (error) {
      console.error(
        `Error cerrando conexión Oracle proxy de la sesión ${context.sessionId}:`,
        error,
      );
    }
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
