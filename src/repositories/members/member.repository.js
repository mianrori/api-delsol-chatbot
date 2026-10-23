import { executeOracleQuery } from "../../database/oracle-query.database.js";
import { config } from "../../../config.js";

const normalizeName = (value = "") => {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenizeName = (value) =>
  normalizeName(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !/^\d+$/.test(token));

const levenshteinDistance = (a, b) => {
  const matrix = Array.from({ length: b.length + 1 }, () =>
    Array(a.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

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
  if (!a || !b) return 0;
  if (a === b) return 100;

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);

  return Math.round((1 - distance / maxLength) * 100);
};

const calculateNameSimilarity = (fullName, search) => {
  const nameTokens = tokenizeName(fullName);
  const searchTokens = tokenizeName(search);

  if (!nameTokens.length || !searchTokens.length) {
    return {
      similarity: 0,
      minTokenSimilarity: 0,
      tokenScores: [],
    };
  }

  const tokenScores = searchTokens.map((searchToken) => {
    let bestScore = 0;
    let bestToken = null;

    for (const nameToken of nameTokens) {
      const score = calculateTokenSimilarity(searchToken, nameToken);

      if (score > bestScore) {
        bestScore = score;
        bestToken = nameToken;
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

  return {
    similarity: Math.round(average * 0.7 + minimum * 0.3),
    minTokenSimilarity: minimum,
    tokenScores,
  };
};

const buildTokenFilters = (searchTokens, binds) =>
  searchTokens.map((token, index) => {
    const bindName = `token${index}`;
    binds[bindName] = token.length > 4 ? token.substring(0, 4) : token;

    return `
      NORMALIZED_FULL_NAME
      LIKE '%' || :${bindName} || '%'
    `;
  });

const getCandidateMembers = async ({
  connection,
  tokenFilters,
  binds,
  operator,
}) => {
  const sql = `
    SELECT
      COD_SOCIO,
      NOMBRE,
      APELLIDO,
      NOMBRE_COMPLETO,
      CATEGORIA,
      ACTIVO
    FROM (
      SELECT
        COD_SOCIO,
        NOMBRE,
        APELLIDO,
        NOMBRE_COMPLETO,
        CATEGORIA,
        ACTIVO,
        UPPER(
          TRIM(
            REGEXP_REPLACE(
              TRANSLATE(
                NVL(NOMBRE_COMPLETO, ''),
                'ÁÉÍÓÚÜÑáéíóúüñ',
                'AEIOUUNAEIOUUN'
              ),
              '[^A-Za-z0-9]+',
              ' '
            )
          )
        ) AS NORMALIZED_FULL_NAME
      FROM VW_BOT_SOCIOS
      WHERE NOMBRE_COMPLETO IS NOT NULL
    )
    WHERE (
      ${tokenFilters.join(`\n      ${operator} `)}
    )
    AND ROWNUM <= :candidateLimit
  `;

  const result = await executeOracleQuery(connection, sql, binds);
  return Array.isArray(result) ? result : [];
};

const rankCandidates = ({ candidates, search, matchPriority }) =>
  candidates
    .map((member) => {
      const score = calculateNameSimilarity(member.NOMBRE_COMPLETO, search);

      return {
        ...member,
        MATCH_PRIORITY: matchPriority,
        SIMILARITY: score.similarity,
        MIN_TOKEN_SIMILARITY: score.minTokenSimilarity,
        TOKEN_SCORES: score.tokenScores,
      };
    })
    .filter(
      (member) =>
        member.SIMILARITY >= Number(config.minSimilarity || 70) &&
        member.MIN_TOKEN_SIMILARITY >= 65,
    )
    .sort((a, b) => {
      if (b.SIMILARITY !== a.SIMILARITY) {
        return b.SIMILARITY - a.SIMILARITY;
      }

      return b.MIN_TOKEN_SIMILARITY - a.MIN_TOKEN_SIMILARITY;
    });

export const searchMembersRepository = async (connection, search) => {
  const searchTokens = tokenizeName(search);

  const exactSql = `
    SELECT
      COD_SOCIO,
      NOMBRE,
      APELLIDO,
      NOMBRE_COMPLETO,
      CATEGORIA,
      ACTIVO
    FROM VW_BOT_SOCIOS
    WHERE
         UPPER(TRIM(COD_SOCIO)) = UPPER(TRIM(:search))
      OR UPPER(TRIM(EMAIL)) = UPPER(TRIM(:search))
      OR (
        REGEXP_REPLACE(NVL(TELEFONO, ''), '[^0-9]', '') =
        REGEXP_REPLACE(:search, '[^0-9]', '')
        AND REGEXP_REPLACE(:search, '[^0-9]', '') IS NOT NULL
      )
  `;

  const exactResult = await executeOracleQuery(connection, exactSql, { search });
  const exactMatches = Array.isArray(exactResult) ? exactResult : [];

  if (exactMatches.length > 0) {
    return exactMatches
      .slice(0, Number(config.limitFilter || 5))
      .map((member) => ({
        ...member,
        MATCH_PRIORITY: 1,
        SIMILARITY: 100,
        MIN_TOKEN_SIMILARITY: 100,
        TOKEN_SCORES: [],
      }));
  }

  if (!searchTokens.length) return [];

  const binds = {};
  const tokenFilters = buildTokenFilters(searchTokens, binds);

  binds.candidateLimit = Math.max(
    Number(config.limitFilter ?? 10) * 50,
    500,
  );

  let candidates = await getCandidateMembers({
    connection,
    tokenFilters,
    binds,
    operator: "AND",
  });

  let matchPriority = 2;

  if (candidates.length === 0) {
    candidates = await getCandidateMembers({
      connection,
      tokenFilters,
      binds,
      operator: "OR",
    });

    matchPriority = 6;
  }

  if (candidates.length === 0) {
    return [];
  }

  let ranked = rankCandidates({
    candidates,
    search,
    matchPriority,
  });

  if (ranked.length === 0 && matchPriority === 2) {
    const fallbackCandidates = await getCandidateMembers({
      connection,
      tokenFilters,
      binds,
      operator: "OR",
    });

    ranked = rankCandidates({
      candidates: fallbackCandidates,
      search,
      matchPriority: 6,
    });
  }

  return ranked.slice(0, Number(config.limitFilter ?? 10));
};

export const getMemberRepository = async (connection, documentNumber) => {
  const sql = `
    SELECT
      COD_SOCIO,
      NOMBRE,
      APELLIDO,
      NOMBRE_COMPLETO,
      TO_CHAR(FECHA_ALTA, 'YYYY-MM-DD') AS FECHA_ALTA,
      TO_CHAR(FECHA_NACIMIENTO, 'YYYY-MM-DD') AS FECHA_NACIMIENTO,
      GENERO,
      EMAIL,
      CATEGORIA,
      ACTIVO,
      OBSERVACION,
      RECIBE_TELEMARKETING,
      GENERA_CUPON,
      TELEFONO
    FROM VW_BOT_SOCIOS
    WHERE COD_SOCIO = :documentNumber
  `;

  const rows = await executeOracleQuery(connection, sql, {
    documentNumber: String(documentNumber),
  });

  return rows?.[0] ?? null;
};
