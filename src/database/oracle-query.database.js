export const executeOracleQuery = async (connection, sql, binds = {}) => {
  try {
    const normalizedSql = String(sql ?? "").replace(/;\s*$/, "").trim();
    const result = await connection.execute(normalizedSql, binds);

    return Array.isArray(result.rows) ? result.rows : [];
  } catch (error) {
    console.error("Error ejecutando consulta Oracle:", error?.message ?? error);

    throw error;
  }
};
