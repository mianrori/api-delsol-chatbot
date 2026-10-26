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
