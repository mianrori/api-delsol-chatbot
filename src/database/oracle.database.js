import oracledb from "oracledb";
import config from "../../config.js";

let oracleClientInitialized = false;

const initializeOracleClient = () => {
  if (oracleClientInitialized) {
    return;
  }

  if (config.oracleClient) {
    oracledb.initOracleClient({ libDir: config.oracleClient });
  } else {
    oracledb.initOracleClient();
  }

  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracleClientInitialized = true;
};

export const connectWithProxy = async (username) => {
  initializeOracleClient();

  const normalizedUsername = String(username ?? "").trim().toUpperCase();

  if (!normalizedUsername) {
    throw new Error("El username es obligatorio para la conexión Oracle proxy.");
  }

  if (!config.proxyUsername || !config.proxyPassword) {
    throw new Error("Las credenciales del usuario proxy Oracle no están configuradas.");
  }

  return oracledb.getConnection({
    user: `${config.proxyUsername}[${normalizedUsername}]`,
    password: config.proxyPassword,
    connectString: `${config.dbHost}:${config.dbPort}/${config.dbSid}`,
  });
};
