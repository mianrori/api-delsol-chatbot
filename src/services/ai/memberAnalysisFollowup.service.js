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
  // Never select an arbitrary cohort from a multi-period or multi-tool answer.
  if (calls.length !== 1 || calls[0].name !== "analyze_members" ||
    calls[0].input?.resultMode !== "members") return null;
  const previous = calls[0];
  const result = turn.filter((item) => item.role === "user")
    .flatMap((item) => item.content ?? []).map((block) => block.toolResult)
    .find((item) => item?.toolUseId === previous.toolUseId);
  const json = result?.content?.find((item) => item.json)?.json;
  if (result?.status !== "success" || json?.status !== "FOUND" ||
    !Array.isArray(json.members) || json.members.length === 0) return null;

  return {
    ...structuredClone(previous.input),
    breakdownBy: [/^(rubro|categoria)/.test(match[1]) ? "category" : "customer"],
  };
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
