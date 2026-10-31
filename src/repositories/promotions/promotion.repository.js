import { executeOracleQuery } from "../../database/oracle-query.database.js";
import config from "../../../config.js";

const normalizeText = (value = "") => {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenize = (value) => {
  return normalizeText(value).split(" ").filter(Boolean);
};

const levenshteinDistance = (a, b) => {
  const matrix = Array.from(
    {
      length: b.length + 1,
    },
    () => Array(a.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
};

const calculateTokenSimilarity = (a, b) => {
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 100;
  }

  const distance = levenshteinDistance(a, b);

  const maxLength = Math.max(a.length, b.length);

  if (maxLength === 0) {
    return 0;
  }

  return Math.round((1 - distance / maxLength) * 100);
};

const calculateTextSimilarity = (promotionName, campaignName, search) => {
  const candidateTokens = tokenize(
    [promotionName, campaignName].filter(Boolean).join(" "),
  );

  const searchTokens = tokenize(search);

  if (candidateTokens.length === 0 || searchTokens.length === 0) {
    return {
      similarity: 0,
      minTokenSimilarity: 0,
      tokenScores: [],
    };
  }

  const tokenScores = searchTokens.map((searchToken) => {
    let bestScore = 0;
    let bestToken = null;

    for (const candidateToken of candidateTokens) {
      const score = calculateTokenSimilarity(searchToken, candidateToken);

      if (score > bestScore) {
        bestScore = score;
        bestToken = candidateToken;
      }
    }

    return {
      searchToken,
      matchedToken: bestToken,
      similarity: bestScore,
    };
  });

  const scores = tokenScores.map((item) => item.similarity);

  const average =
    scores.reduce((total, value) => total + value, 0) / scores.length;

  const minimum = Math.min(...scores);

  const similarity = Math.round(average * 0.75 + minimum * 0.25);

  return {
    similarity,
    minTokenSimilarity: minimum,
    tokenScores,
  };
};

const normalizedColumn = (column) => `UPPER(TRIM(REGEXP_REPLACE(
  TRANSLATE(NVL(${column}, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN'), '[^A-Za-z0-9]+', ' ')))`;

const getPagination = ({ page = 1, rows = Number(config.limitFilter) || 10 } = {}) => {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(rows) || rows < 1 || rows > 50 || !Number.isSafeInteger(page * rows)) {
    throw new Error("La página debe ser un entero positivo y rows un entero entre 1 y 50.");
  }
  return { page, rows, offset: (page - 1) * rows };
};

const pageResult = (items, totalRows, pagination, matchMode) => ({
  items, totalRows, page: pagination.page, rows: pagination.rows,
  totalPages: Math.ceil(totalRows / pagination.rows),
  hasMore: pagination.page * pagination.rows < totalRows,
  nextPage: pagination.page * pagination.rows < totalRows ? pagination.page + 1 : null,
  matchMode,
});

export const searchPromotionsRepository = async (connection, search, paging = {}) => {
  const pagination = getPagination(paging);
  const normalizedSearch = normalizeText(search);
  if (!normalizedSearch) return pageResult([], 0, pagination, "text");
  const tokens = tokenize(search);
  const binds = { search: String(search).trim(), startRow: pagination.offset + 1, endRow: pagination.offset + pagination.rows };
  const textFilters = tokens.map((token, index) => {
    binds[`word${index}`] = token;
    return `(INSTR(NORMALIZED_PROMOTION, :word${index}) > 0 OR INSTR(NORMALIZED_CAMPAIGN, :word${index}) > 0)`;
  });
  const sql = `
    WITH source AS (
      SELECT COD_PROMOCION, COD_CAMPANIA, NOMBRE_PROMOCION, NOMBRE_CAMPANIA,
             FECHA_DESDE AS START_DATE, FECHA_HASTA AS END_DATE,
             ${normalizedColumn("NOMBRE_PROMOCION")} AS NORMALIZED_PROMOTION,
             ${normalizedColumn("NOMBRE_CAMPANIA")} AS NORMALIZED_CAMPAIGN
        FROM VW_BOT_PROMOCIONES
    ), matches AS (
      SELECT source.*, CASE WHEN UPPER(TRIM(COD_PROMOCION)) = UPPER(:search)
                             OR TO_CHAR(COD_CAMPANIA) = :search THEN 1 ELSE 2 END AS MATCH_PRIORITY
        FROM source
       WHERE UPPER(TRIM(COD_PROMOCION)) = UPPER(:search)
          OR TO_CHAR(COD_CAMPANIA) = :search
          OR (${textFilters.join(" AND ")})
    ), ranked AS (
      SELECT matches.*, ROW_NUMBER() OVER (
        ORDER BY MATCH_PRIORITY, START_DATE DESC NULLS LAST, COD_PROMOCION, COD_CAMPANIA,
                 NOMBRE_PROMOCION, NOMBRE_CAMPANIA, END_DATE DESC NULLS LAST
      ) AS RESULT_ROW_NUMBER FROM matches
    )
    SELECT totals.TOTAL_ROWS, page_rows.COD_PROMOCION, page_rows.COD_CAMPANIA,
           page_rows.NOMBRE_PROMOCION, page_rows.NOMBRE_CAMPANIA, page_rows.MATCH_PRIORITY,
           TO_CHAR(page_rows.START_DATE, 'DD/MM/YYYY') AS FECHA_DESDE,
           TO_CHAR(page_rows.END_DATE, 'DD/MM/YYYY') AS FECHA_HASTA
      FROM (SELECT COUNT(*) AS TOTAL_ROWS FROM matches) totals
      LEFT JOIN (SELECT * FROM ranked WHERE RESULT_ROW_NUMBER BETWEEN :startRow AND :endRow) page_rows ON 1 = 1
     ORDER BY page_rows.RESULT_ROW_NUMBER
  `;
  const result = await executeOracleQuery(connection, sql, binds);
  const totalRows = Number(result[0]?.TOTAL_ROWS ?? 0);
  if (totalRows > 0) {
    return pageResult(result.filter((row) => row.COD_PROMOCION != null), totalRows, pagination, "text");
  }

  // Approximate matching remains a fallback. Rank the complete candidate set
  // before paging so neither the total nor uniqueness depends on a hidden cap.
  const fuzzyBinds = {};
  const fuzzyFilters = tokens.map((token, index) => {
    fuzzyBinds[`token${index}`] = token.length > 4 ? token.substring(0, 4) : token;
    return `(INSTR(${normalizedColumn("NOMBRE_PROMOCION")}, :token${index}) > 0 OR INSTR(${normalizedColumn("NOMBRE_CAMPANIA")}, :token${index}) > 0)`;
  });
  const candidates = await executeOracleQuery(connection, `
    SELECT COD_PROMOCION, COD_CAMPANIA, NOMBRE_PROMOCION, NOMBRE_CAMPANIA,
           TO_CHAR(FECHA_DESDE, 'DD/MM/YYYY') AS FECHA_DESDE,
           TO_CHAR(FECHA_HASTA, 'DD/MM/YYYY') AS FECHA_HASTA
      FROM VW_BOT_PROMOCIONES
     WHERE ${fuzzyFilters.join(" OR ")}
     ORDER BY VW_BOT_PROMOCIONES.FECHA_DESDE DESC NULLS LAST, COD_PROMOCION, COD_CAMPANIA
  `, fuzzyBinds);
  const dateKey = (value) => String(value ?? "").split("/").reverse().join("");
  const ranked = candidates.map((item) => {
    const score = calculateTextSimilarity(item.NOMBRE_PROMOCION, item.NOMBRE_CAMPANIA, search);
    return { ...item, MATCH_PRIORITY: 3, SIMILARITY: score.similarity, MIN_TOKEN_SIMILARITY: score.minTokenSimilarity };
  }).filter((item) => item.SIMILARITY >= Number(config.minSimilarity ?? 65) && item.MIN_TOKEN_SIMILARITY >= 60)
    .sort((a, b) => b.SIMILARITY - a.SIMILARITY || dateKey(b.FECHA_DESDE).localeCompare(dateKey(a.FECHA_DESDE)) ||
      String(a.COD_PROMOCION).localeCompare(String(b.COD_PROMOCION)) || String(a.COD_CAMPANIA).localeCompare(String(b.COD_CAMPANIA)));
  return pageResult(ranked.slice(pagination.offset, pagination.offset + pagination.rows), ranked.length, pagination, "approximate");
};
