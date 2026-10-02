import { oracleSessionsQuery } from "../../database/oracleSessions.database.js";

export const getOracleSessionRepository = async (sessionId) => {
  const result = await oracleSessionsQuery(
    `
      SELECT
        session_id,
        username,
        status,
        created_at,
        last_activity_at,
        expires_at,
        closed_at
      FROM oracle_sessions
      WHERE session_id = $1
      LIMIT 1
    `,
    [sessionId],
  );

  return result.rows[0] ?? null;
};

export const touchOracleSessionRepository = async (sessionId) => {
  const result = await oracleSessionsQuery(
    `
      UPDATE oracle_sessions
      SET last_activity_at = CURRENT_TIMESTAMP
      WHERE session_id = $1
        AND status = 'ACTIVE'
      RETURNING
        session_id,
        username,
        status,
        last_activity_at
    `,
    [sessionId],
  );

  return result.rows[0] ?? null;
};
