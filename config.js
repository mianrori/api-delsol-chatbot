const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
};

const config = {
  port: Number(process.env.PORT || 5400),
  env: process.env.NODE_ENV || "development",

  // Oracle ERP
  dbSid: process.env.DB_SID,
  dbHost: process.env.DB_HOST,
  dbPort: process.env.DB_PORT,
  oracleClient: process.env.ORACLE_CLIENT,

  // Oracle proxy
  proxyUsername: process.env.PROXY_USERNAME,
  proxyPassword: process.env.PROXY_PASSWORD,

  // PostgreSQL - sesiones Oracle compartidas
  pgOracleSessionsHost: process.env.PG_ORACLE_SESSIONS_HOST,
  pgOracleSessionsPort: process.env.PG_ORACLE_SESSIONS_PORT,
  pgOracleSessionsDatabase: process.env.PG_ORACLE_SESSIONS_DATABASE,
  pgOracleSessionsUser: process.env.PG_ORACLE_SESSIONS_USER,
  pgOracleSessionsPassword: process.env.PG_ORACLE_SESSIONS_PASSWORD,

  // Búsquedas
  minSimilarity: process.env.MIN_SIMILARITY,
  limitFilter: process.env.LIMIT_FILTER,

  // AWS Bedrock
  awsRegion: process.env.AWS_REGION,
  awsBedrockModelId: process.env.AWS_BEDROCK_MODEL_ID,
  awsBedrockMaxTokens: process.env.AWS_BEDROCK_MAX_TOKENS,
  awsBedrockTemperature: process.env.AWS_BEDROCK_TEMPERATURE,
  awsBearerTokenBedrock: process.env.AWS_BEARER_TOKEN_BEDROCK,

  // Debug de desarrollo
  bedrockDebug: toBoolean(process.env.BEDROCK_DEBUG, false),
  bedrockDebugPayloads: toBoolean(
    process.env.BEDROCK_DEBUG_PAYLOADS,
    false,
  ),
  piiDebug: toBoolean(process.env.PII_DEBUG, false),
  piiDebugShowRaw: toBoolean(process.env.PII_DEBUG_SHOW_RAW, false),
};

export default config;
export { config };
