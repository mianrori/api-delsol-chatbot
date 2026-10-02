import pg from "pg";
import config from "../../config.js";

const { Pool } = pg;

let oracleSessionsPool = null;

const createOracleSessionsPool = () => {
  const pool = new Pool({
    host: config.pgOracleSessionsHost,
    port: Number(config.pgOracleSessionsPort || 5432),
    database: config.pgOracleSessionsDatabase,
    user: config.pgOracleSessionsUser,
    password: config.pgOracleSessionsPassword,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: "api-delsol-chatbot-oracle-sessions",
  });

  pool.on("error", (error) => {
    console.error("PostgreSQL Oracle sessions pool error:", error);
  });

  return pool;
};

export const getOracleSessionsPool = () => {
  if (!oracleSessionsPool) {
    oracleSessionsPool = createOracleSessionsPool();
  }

  return oracleSessionsPool;
};

export const oracleSessionsQuery = async (text, params = []) => {
  return getOracleSessionsPool().query(text, params);
};

export const closeOracleSessionsPool = async () => {
  if (!oracleSessionsPool) {
    return;
  }

  await oracleSessionsPool.end();
  oracleSessionsPool = null;
};
