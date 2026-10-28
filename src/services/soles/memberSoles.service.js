import { getMemberSolesRepository } from "../../repositories/soles/memberSoles.repository.js";

const parseDate = (value, fieldName = "date") => {
  if (typeof value !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    throw new Error(`${fieldName} debe tener formato DD/MM/YYYY.`);
  }

  const [day, month, year] = value.split("/").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} contiene una fecha inválida.`);
  }

  return date;
};

const formatDate = (date) => {
  const day = String(date.getUTCDate()).padStart(2, "0");

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${day}/${month}/${date.getUTCFullYear()}`;
};

const getTodayAsUTC = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
};

export const getSolesGenerationPeriodStart = (referenceDate) => {
  const year = referenceDate.getUTCFullYear();

  const novemberFirst = new Date(Date.UTC(year, 10, 1));

  if (referenceDate.getTime() >= novemberFirst.getTime()) {
    return novemberFirst;
  }

  return new Date(Date.UTC(year - 1, 10, 1));
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [value];
};

export const getMemberSoles = async (
  {
    documentNumber,

    typeIds = [],

    status = "current",

    /*
     * Dejamos undefined para poder distinguir
     * si el modelo lo envió explícitamente o no.
     */
    mode,

    groupBy,

    referenceDate,

    useCurrentGenerationPeriod = true,

    generationDateFrom,
    generationDateTo,

    expirationDateFrom,
    expirationDateTo,

    page = 1,
    rows = 20,
  },
  connection,
) => {
  if (!documentNumber) {
    throw new Error("documentNumber es obligatorio.");
  }

  if (typeof documentNumber !== "string" || !documentNumber.trim()) throw new Error("El número de documento es obligatorio.");
  if (!["current", "expired", "all"].includes(status)) throw new Error("Estado de vigencia no soportado.");
  if (mode !== undefined && !["balance", "detail", "summary"].includes(mode)) throw new Error("Modo de consulta no soportado.");
  if (typeof useCurrentGenerationPeriod !== "boolean") throw new Error("useCurrentGenerationPeriod debe ser booleano.");
  if (!Array.isArray(typeIds) || typeIds.some((id) => !/^-?\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)))) throw new Error("Los tipos de soles deben ser identificadores previamente resueltos.");
  if (groupBy !== undefined && (!Array.isArray(groupBy) || groupBy.some((dimension) => !["type", "month", "year", "expirationMonth", "expirationDate"].includes(dimension)))) throw new Error("Agrupación de soles no soportada.");
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(rows) || rows < 1 || rows > 100 || !Number.isSafeInteger(page * rows)) throw new Error("Página inválida: rows debe estar entre 1 y 100.");
  for (const [fromKey, from, toKey, to] of [
    ["generationDateFrom", generationDateFrom, "generationDateTo", generationDateTo],
    ["expirationDateFrom", expirationDateFrom, "expirationDateTo", expirationDateTo],
  ]) {
    const start = from === undefined ? null : parseDate(from, fromKey);
    const end = to === undefined ? null : parseDate(to, toKey);
    if (start && end && start > end) throw new Error("La fecha inicial no puede ser posterior a la final.");
  }

  const resolvedReferenceDate = referenceDate !== undefined
    ? parseDate(referenceDate, "referenceDate")
    : getTodayAsUTC();

  const normalizedReferenceDate = formatDate(resolvedReferenceDate);

  let resolvedGenerationDateFrom = generationDateFrom ?? null;

  let resolvedGenerationDateTo = generationDateTo ?? null;

  /*
   * =============================================================
   * PERÍODO AUTOMÁTICO PARA VENCIDOS
   * =============================================================
   */
  if (
    status === "expired" &&
    useCurrentGenerationPeriod === true &&
    !generationDateFrom &&
    !generationDateTo
  ) {
    resolvedGenerationDateFrom = formatDate(
      getSolesGenerationPeriodStart(resolvedReferenceDate),
    );

    resolvedGenerationDateTo = normalizedReferenceDate;
  }

  /*
   * =============================================================
   * COMPORTAMIENTO POR DEFECTO PARA SALDO VIGENTE
   * =============================================================
   *
   * Si la consulta es por Soles actuales/vigentes y el modelo
   * no especificó mode ni groupBy, devolvemos:
   *
   * - resumen
   * - por tipo
   * - por fecha exacta de vencimiento
   *
   * Esto permite responder:
   *
   * Tipo | Saldo | Vencimiento
   *
   * sin perder el detalle de vencimientos diferentes.
   */
  const shouldUseDefaultCurrentBreakdown =
    status === "current" && mode === undefined && groupBy === undefined;

  const resolvedMode = shouldUseDefaultCurrentBreakdown
    ? "summary"
    : (mode ?? "balance");

  const resolvedGroupBy = shouldUseDefaultCurrentBreakdown
    ? ["type", "expirationDate"]
    : normalizeArray(groupBy);

  const repositoryArgs = {
    documentNumber: String(documentNumber).trim(),

    typeIds: normalizeArray(typeIds),

    status,

    mode: resolvedMode,

    groupBy: resolvedGroupBy,

    referenceDate: normalizedReferenceDate,

    generationDateFrom: resolvedGenerationDateFrom,

    generationDateTo: resolvedGenerationDateTo,

    expirationDateFrom: expirationDateFrom ?? null,

    expirationDateTo: expirationDateTo ?? null,

    page,
    rows,
  };

  /*
   * =============================================================
   * CONSULTA PRINCIPAL
   * =============================================================
   */
  const result = await getMemberSolesRepository({
    connection,
    ...repositoryArgs,
  });

  /*
   * =============================================================
   * TOTAL EXPLÍCITO DEL SALDO VIGENTE
   * =============================================================
   *
   * Cuando devolvemos un summary agrupado de Soles vigentes,
   * hacemos además una consulta balance sin groupBy.
   *
   * Así Bedrock no necesita sumar las filas agrupadas.
   */
  let summary = null;

  if (status === "current" && resolvedMode === "summary") {
    const balanceResult = await getMemberSolesRepository({
      connection,

      documentNumber: repositoryArgs.documentNumber,

      typeIds: repositoryArgs.typeIds,

      status: "current",

      mode: "balance",

      groupBy: [],

      referenceDate: normalizedReferenceDate,

      generationDateFrom: resolvedGenerationDateFrom,

      generationDateTo: resolvedGenerationDateTo,

      expirationDateFrom: expirationDateFrom ?? null,

      expirationDateTo: expirationDateTo ?? null,
    });

    summary = {
      currentBalance: Number(balanceResult.balance ?? 0),

      recordCount: Number(balanceResult.recordCount ?? 0),

      memberName: balanceResult.memberName ?? null,
    };
  }

  return {
    ...result,
    documentNumber: repositoryArgs.documentNumber,

    ...(summary
      ? {
          summary,
        }
      : {}),

    queryContext: {
      status,

      mode: resolvedMode,

      groupBy: resolvedGroupBy,

      referenceDate: normalizedReferenceDate,

      generationPeriod: {
        dateFrom: resolvedGenerationDateFrom,

        dateTo: resolvedGenerationDateTo,

        currentPeriodApplied:
          status === "expired" &&
          useCurrentGenerationPeriod === true &&
          !generationDateFrom &&
          !generationDateTo,
      },

      typeIds: repositoryArgs.typeIds,
      expirationPeriod: { dateFrom: expirationDateFrom ?? null, dateTo: expirationDateTo ?? null },
    },
  };
};
