import { executeOracleQuery } from "../../database/oracle-query.database.js";

const map = (rows) => rows.map((row) => ({ typeId: Number(row.COD_TIPO_SOL), description: row.DESCRIPCION ?? null }));
const normalizedDescription = `UPPER(TRIM(TRANSLATE(DESCRIPCION, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN')))`;

export const searchSolesTypesRepository = async ({ connection, query }) => {
  const searchText = String(query ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  if (!searchText) return [];
  return map(await executeOracleQuery(connection, `
    SELECT COD_TIPO_SOL, DESCRIPCION FROM VW_BOT_TIPOS_SOLES
     WHERE INSTR(${normalizedDescription}, :query) > 0 OR TO_CHAR(COD_TIPO_SOL) = :query
     ORDER BY CASE WHEN ${normalizedDescription} = :query THEN 1 ELSE 2 END, DESCRIPCION, COD_TIPO_SOL
  `, { query: searchText }));
};

export const getAllSolesTypesRepository = async ({ connection }) => map(await executeOracleQuery(connection, `
  SELECT COD_TIPO_SOL, DESCRIPCION FROM VW_BOT_TIPOS_SOLES ORDER BY DESCRIPCION, COD_TIPO_SOL
`));
