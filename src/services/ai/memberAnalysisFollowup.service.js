const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonical(value[key])]));
  }
  return value;
};

const rankingKey = (input) => {
  const { breakdownBy, ...ranking } = input ?? {};
  return JSON.stringify(canonical(ranking));
};

// Accept a ranking followed by breakdowns only when both filters and the
// ordered cohort match. Never collapse comparisons of different rankings.
export const selectEquivalentMemberAnalysis = (calls = []) => {
  if (calls.length === 0) return null;
  const first = calls[0];
  const cohortKey = (result) => JSON.stringify(result?.members?.map((member) => ({
    documentNumber: member.documentNumber,
    currency: canonical(member.currency),
  })));
  for (const call of calls) {
    if (call.name !== "analyze_members" || call.input?.resultMode !== "members" ||
      rankingKey(call.input) !== rankingKey(first.input) ||
      call.result?.status !== "FOUND" || !Array.isArray(call.result.members) ||
      call.result.members.length === 0 ||
      call.result.members.some((member) => !member.documentNumber) ||
      cohortKey(call.result) !== cohortKey(first.result)) return null;
  }
  return calls[calls.length - 1];
};

// Resolve only short requests that change the breakdown of the previous turn.
// Explicit dates, new filters and individual-member questions go to the model.
export const resolveMemberAnalysisFollowup = ({ message, history = [] }) => {
  const text = String(message ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[¿?¡!.,;:]/g, "").replace(/\s+/g, " ").trim();
  const match = text.match(
    /^(?:ahora )?(?:(?:detalla|desglosa|desglosalo|detallalo|separa|separalo|muestra|muestralo) )?(?:sus compras |las compras |el detalle |el desglose )?por (rubro|rubros|categoria|categorias|local|locales|comercio|comercios)$/,
  );
  if (!match) return null;

  let turnStart = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]?.role === "user" &&
      history[index]?.content?.some((block) => typeof block.text === "string")) {
      turnStart = index;
      break;
    }
  }
  if (turnStart < 0) return null;
  const turn = history.slice(turnStart);
  const calls = turn.filter((item) => item.role === "assistant")
    .flatMap((item) => item.content ?? []).map((block) => block.toolUse).filter(Boolean);
  const results = turn.filter((item) => item.role === "user")
    .flatMap((item) => item.content ?? []).map((block) => block.toolResult).filter(Boolean);
  const previous = selectEquivalentMemberAnalysis(calls.map((call) => {
    const response = results.find((item) => item.toolUseId === call.toolUseId);
    return { ...call, result: response?.status === "success"
      ? response.content?.find((item) => item.json)?.json : null };
  }));
  if (!previous) return null;

  return {
    ...structuredClone(previous.input),
    breakdownBy: [/^(rubro|categoria)/.test(match[1]) ? "category" : "customer"],
  };
};

// Summary comparisons keep one independent query per calendar month. Recover
// only the latest user turn, never a comparison from an earlier topic.
const resolveLatestMemberSummaryFollowup = ({ message, history = [] }) => {
  const text = String(message ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[¿?¡!.,;:]/g, "").replace(/\s+/g, " ").trim();
  const match = text.match(
    /^(?:ahora )?(?:(?:detalla|desglosa|desglosalo|detallalo|separa|separalo|muestra|muestralo) )?(?:sus compras |las compras |el detalle |el desglose )?(?:cada mes |cada periodo )?por (rubro|rubros|categoria|categorias|local|locales|comercio|comercios)$/,
  );
  if (!match) return null;

  let start = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]?.role === "user" && history[index].content?.some((block) => typeof block.text === "string")) {
      start = index;
      break;
    }
  }
  if (start < 0) return null;
  const turn = history.slice(start);
  const calls = turn.filter((item) => item.role === "assistant")
    .flatMap((item) => item.content ?? []).map((block) => block.toolUse).filter(Boolean);
  const results = turn.filter((item) => item.role === "user")
    .flatMap((item) => item.content ?? []).map((block) => block.toolResult).filter(Boolean);
  if (!calls.length) return null;

  const filtersKey = (input) => {
    const { purchasePeriods, breakdownBy, ...filters } = input;
    return JSON.stringify(canonical(filters));
  };
  const isCalendarMonth = (period) => {
    const from = /^01\/(\d{2})\/(\d{4})$/.exec(String(period?.dateFrom ?? ""));
    const to = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(period?.dateTo ?? ""));
    if (!from || !to || from[1] !== to[2] || from[2] !== to[3]) return false;
    const month = Number(from[1]);
    const year = Number(from[2]);
    return month >= 1 && month <= 12 && year >= 100 &&
      Number(to[1]) === new Date(Date.UTC(year, month, 0)).getUTCDate();
  };
  const periods = new Map();
  for (const call of calls) {
    const input = call.input;
    if (call.name !== "analyze_members" || input?.resultMode !== "summary" ||
      !Array.isArray(input.purchasePeriods) || input.purchasePeriods.length !== 1 ||
      !isCalendarMonth(input.purchasePeriods[0]) || filtersKey(input) !== filtersKey(calls[0].input)) return null;
    const response = results.find((item) => item.toolUseId === call.toolUseId);
    const result = response?.content?.find((item) => item.json)?.json;
    const period = input.purchasePeriods[0];
    const returnedPeriod = result?.analysis?.periodDefinition?.[0];
    if (response?.status !== "success" || !["FOUND", "NOT_FOUND"].includes(result?.status) ||
      !Array.isArray(result.summary?.totalsByCurrency) ||
      result.analysis?.periodDefinition?.length !== 1 ||
      returnedPeriod?.dateFrom !== period.dateFrom || returnedPeriod?.dateTo !== period.dateTo) return null;
    periods.set(`${period.dateFrom}:${period.dateTo}`, {
      ...structuredClone(input),
      breakdownBy: [/^(rubro|categoria)/.test(match[1]) ? "category" : "customer"],
    });
  }
  if (periods.size > 24) return null;
  return [...periods.values()];
};

// Repeat only an identical request within a contiguous sequence of compatible
// summary turns. Re-run its original inputs so data and permissions stay current.
const normalizedRequest = (message) => String(message ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[¿?¡!.,;:]/g, "").replace(/\s+/g, " ").trim();

export const resolveMemberSummaryFollowup = ({ message, history = [] }) => {
  const direct = resolveLatestMemberSummaryFollowup({ message, history });
  if (direct) return direct;
  const starts = history.flatMap((item, index) => item?.role === "user" &&
    item.content?.some((block) => typeof block.text === "string") ? [index] : []);
  let latestKey;
  const key = (plans) => JSON.stringify(plans.map(({ breakdownBy, ...input }) => {
    const copy = structuredClone(input);
    copy.purchasePeriods = copy.purchasePeriods.map(({ label, ...period }) => period);
    return canonical(copy);
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  for (let index = starts.length - 1; index >= 0; index--) {
    const turn = history.slice(starts[index], starts[index + 1] ?? history.length);
    const plans = resolveLatestMemberSummaryFollowup({ message: "Por rubro", history: turn });
    if (!plans) return null;
    const signature = key(plans);
    if (latestKey !== undefined && signature !== latestKey) return null;
    latestKey = signature;
    const previousText = turn[0].content.filter((block) => typeof block.text === "string")
      .map((block) => block.text).join(" ");
    if (normalizedRequest(previousText) === normalizedRequest(message)) {
      // Recover exactly the requested breakdown (or its absence), not the
      // arbitrary dimension used above to validate each historical turn.
      return plans.map((plan) => {
        const original = turn.filter((item) => item.role === "assistant")
          .flatMap((item) => item.content ?? []).map((block) => block.toolUse)
          .filter(Boolean).filter((call) => call.input.purchasePeriods[0].dateFrom === plan.purchasePeriods[0].dateFrom).at(-1);
        return structuredClone(original.input);
      });
    }
  }
  return null;
};

export const buildMemberAnalysisBreakdownResponse = (calls = []) => {
  const selected = selectEquivalentMemberAnalysis(calls);
  const dimensions = selected?.input?.breakdownBy;
  if (!Array.isArray(dimensions) || dimensions.length !== 1 ||
    !["category", "customer"].includes(dimensions[0]) ||
    !selected.result.members.every((member) =>
      Array.isArray(member.breakdown?.[dimensions[0]]))) return null;
  return buildMemberAnalysisFollowupResponse(selected);
};

export const buildMemberAnalysisFollowupResponse = ({ input, result }) => {
  if (result?.status !== "FOUND" || !Array.isArray(result.members)) {
    return "No se encontraron socios para el desglose solicitado.";
  }
  const dimension = input.breakdownBy[0];
  const label = dimension === "category" ? "Rubro" : "Local";
  const nameField = dimension === "category" ? "categoryName" : "customerName";
  const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const number = (value) => value == null ? "—" :
    new Intl.NumberFormat("es-PY", { maximumFractionDigits: 20 }).format(value);
  const lines = [
    `**Compras por ${label.toLowerCase()} de los socios del ranking**`, "",
    ...(result.analysis?.periodDefinition ?? []).map((period) =>
      `Compras del ${cell(period.dateFrom)} al ${cell(period.dateTo)}.`),
    "", `| Socio | ${label} | Compras realizadas | Monto total de compras |`,
    "| --- | --- | --- | --- |",
  ];
  for (const member of result.members) {
    const rows = member.breakdown?.[dimension] ?? [];
    if (!rows.length) {
      lines.push(`| ${cell(member.fullName)} | Sin compras registradas para este desglose | — | — |`);
    }
    for (const row of rows) {
      const currency = member.currency?.symbol || member.currency?.description || "";
      lines.push(`| ${cell(member.fullName)} | ${cell(row[nameField])} | ${number(row.purchaseCount)} | ${cell(currency)} ${number(row.totalAmount)} |`);
    }
  }
  lines.push("", `El desglose corresponde a los ${result.members.length} socios del ranking, con los mismos filtros y período.`);
  return lines.join("\n");
};
