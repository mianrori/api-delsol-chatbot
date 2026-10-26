const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const cell = (value) => String(value ?? "—")
  .replace(/\|/g, "\\|")
  .replace(/[\r\n]+/g, " ");

const number = (value) => new Intl.NumberFormat("es-PY", {
  maximumFractionDigits: 20,
}).format(value);

// Only replace simple demographic rankings. Comparisons, breakdowns and
// combined tool answers keep their existing presentation.
export const buildMemberRankingResponse = (calls = []) => {
  if (calls.length !== 1) return null;
  const { name, input = {}, result } = calls[0];
  const supportedKeys = new Set([
    "gender", "ageMin", "ageMax", "birthMonth", "resultMode", "limit",
    "orderBy", "orderDirection", "metrics", "purchasePeriods",
  ]);
  const periods = result?.analysis?.periodDefinition;
  if (
    name !== "analyze_members" || input.resultMode !== "members" ||
    input.orderBy !== "totalAmount" ||
    Object.keys(input).some((key) => !supportedKeys.has(key)) ||
    !Array.isArray(periods) || periods.length !== 1 ||
    result?.status !== "FOUND" || !Array.isArray(result.members) ||
    result.members.length === 0 || Object.keys(result.breakdown ?? {}).length > 0
  ) return null;

  const members = result.members;
  const filters = [];
  if (input.gender === "female") filters.push("Mujeres");
  if (input.gender === "male") filters.push("Hombres");
  if (input.ageMin != null) filters.push(`Edad actual mínima: ${input.ageMin} años`);
  if (input.ageMax != null) filters.push(`Edad actual máxima: ${input.ageMax} años`);
  if (input.birthMonth != null) {
    filters.push(`Cumpleaños en ${MONTHS[input.birthMonth - 1]}`);
  }
  filters.push(`Compras del ${periods[0].dateFrom} al ${periods[0].dateTo}`);

  const columns = [
    { label: "Posición", value: (_member, index) => index + 1 },
    { label: "Socio", value: (member) => member.fullName },
  ];
  if (members.some((member) => member.age != null)) {
    columns.push({ label: "Edad actual", value: (member) => member.age });
  }
  if (members.some((member) => member.purchaseCount != null)) {
    columns.push({ label: "Compras realizadas", value: (member) =>
      member.purchaseCount == null ? null : number(member.purchaseCount) });
  }
  if (members.some((member) => member.recurrenceMonths != null)) {
    columns.push({ label: "Meses con compras", value: (member) => member.recurrenceMonths });
  }
  columns.push({ label: "Monto total de compras", value: (member) => {
    if (member.totalAmount == null) return null;
    const currency = member.currency?.symbol || member.currency?.description || "";
    return `${currency} ${number(member.totalAmount)}`.trim();
  } });

  const lines = [
    "**Ranking de socios por monto total de compras**",
    "", filters.join(". ") + ".", "",
    `| ${columns.map((column) => column.label).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...members.map((member, index) =>
      `| ${columns.map((column) => cell(column.value(member, index))).join(" | ")} |`),
  ];
  if (result.summary?.hasMore === true) {
    const total = result.summary.totalMatches;
    lines.push("", Number.isInteger(total) && total > members.length
      ? `Se muestran ${members.length} de ${number(total)} socios que cumplen los filtros.`
      : `Se muestra un listado limitado a ${members.length} socios; existen más socios que cumplen los filtros.`);
  }
  return lines.join("\n");
};
