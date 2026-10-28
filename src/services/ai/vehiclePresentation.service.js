const cell = (value) => value == null ? "Sin datos" : String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const flag = (value) => value == null ? "Sin datos" : value ? "Sí" : "No";
const labels = { day: "Día de registro", month: "Mes de registro", year: "Año de registro", gender: "Género", age: "Edad", ageRange: "Rango de edad", brand: "Marca", model: "Modelo", color: "Color", active: "Activo", automaticDebit: "Débito automático" };
const dimension = (key, value) => ["active", "automaticDebit"].includes(key) ? flag(value) : key === "gender" ? ({ M: "Masculino", F: "Femenino" }[value] ?? cell(value)) : cell(value);
const table = (head, rows) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)];
export const buildVehicleResponse = (calls = []) => {
  if (calls.length === 1 && calls[0].name === "get_vehicle_registrations") {
    const result = calls[0].result;
    if (!result?.queryContext || !Array.isArray(result.data) || !result.totals) return null;
    const q = result.queryContext;
    const lines = ["**Registros de vehículos**", "", `Fecha de registro: ${cell(q.dateFrom)} a ${cell(q.dateTo)}.`, "",
      `Registros: **${result.totals.vehicleCount}**. Matrículas únicas: **${result.totals.plateCount}**. Socios identificados: **${result.totals.memberCount}**.`, ""];
    if (result.mode === "detail") {
      if (result.data.length) lines.push(...table(["Matrícula", "Socio registrado", "Marca", "Modelo", "Color", "Fecha de registro", "Activo", "Débito automático"],
        result.data.map((r) => [cell(r.plate), cell(r.fullName), cell(r.brand), cell(r.model), cell(r.color), cell(r.registrationDate), flag(r.active), flag(r.automaticDebit)])));
      else lines.push("No hay registros en esta página.");
      const p = result.pagination;
      lines.push("", `Se muestran ${p.returnedRows} de ${p.totalRows} registros${p.totalPages ? ` (página ${p.page} de ${p.totalPages})` : ""}.`);
      if (p.hasMore) lines.push("Puedes pedir «siguiente página» para ver más registros.");
    } else if (result.groupBy.length) {
      if (result.data.length) lines.push(...table([...result.groupBy.map((key) => labels[key]), "Registros", "Matrículas únicas", "Socios identificados"],
        result.data.map((r) => [...result.groupBy.map((key) => dimension(key, r[key])), r.vehicleCount, r.plateCount, r.memberCount])));
      else lines.push("No se encontraron registros para esos filtros.");
      lines.push("", "Los totales de matrículas únicas y socios se calculan sobre el conjunto completo; no se suman entre grupos.");
    }
    if (q.groupBy.some((key) => ["age", "ageRange"].includes(key)) || q.ageMin != null || q.ageMax != null) lines.push("", q.ageReference === "registration" ? "Edad del socio a la fecha de registro del vehículo." : `Edad del socio al ${cell(q.referenceDate)}.`);
    if (q.groupBy.some((key) => ["age", "ageRange", "gender"].includes(key))) lines.push("", "Los datos demográficos faltantes o inconsistentes se muestran como «Sin datos».");
    return lines.join("\n");
  }
  const vehicles = calls.filter((call) => call.name === "get_member_vehicles");
  if (vehicles.length !== 1 || calls.some((call) => !["get_member_vehicles", "search_members"].includes(call.name))) return null;
  const result = vehicles[0].result;
  if (!result) return null;
  if (result.status === "NOT_FOUND") return "No se encontraron vehículos registrados para los datos consultados.";
  if (result.status === "AMBIGUOUS" && Array.isArray(result.registrations)) return ["La matrícula figura asociada a más de un socio. Estos son los registros encontrados:", "",
    ...table(["Socio registrado", "Número de documento", "Matrícula", "Estado"], result.registrations.map((r) => [cell(r.owner.fullName), cell(r.owner.documentNumber), cell(r.vehicle.plate), cell(r.vehicle.status)]))].join("\n");
  if (result.owner && result.vehicle) return [`El vehículo con matrícula **${cell(result.vehicle.plate)}** figura registrado a nombre de **${cell(result.owner.fullName)}**.`,
    `Número de documento: ${cell(result.owner.documentNumber)}.`, `Estado del vehículo: ${cell(result.vehicle.status)}.`].join("\n");
  if (Array.isArray(result.vehicles)) return ["**Vehículos registrados del socio**", "", ...table(["Matrícula", "Marca", "Modelo", "Color", "Fecha de registro", "Estado", "Débito automático"],
    result.vehicles.map((r) => [cell(r.plate), cell(r.brand), cell(r.model), cell(r.color), cell(r.registrationDate), cell(r.status), flag(r.automaticDebit)]))].join("\n");
  return null;
};
export const resolveVehiclePage = ({ message, history = [] }) => {
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[¿?¡!.,;:]/g, "").trim();
  if (!/^(siguiente|siguiente pagina|ver mas|mostrar mas)$/.test(text)) return null;
  let start = -1;
  for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "user" && history[i].content?.some((block) => typeof block.text === "string")) { start = i; break; }
  if (start < 0) return null;
  const blocks = history.slice(start).flatMap((item) => item.content ?? []);
  const calls = blocks.map((block) => block.toolUse).filter(Boolean);
  if (calls.length !== 1 || calls[0].name !== "get_vehicle_registrations") return null;
  const response = blocks.map((block) => block.toolResult).find((item) => item?.toolUseId === calls[0].toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || result?.mode !== "detail" || !result.queryContext || !result.pagination) return null;
  if (!result.pagination.hasMore) return { answer: "No hay más páginas de registros de vehículos para esos filtros." };
  const { timezone, ...input } = structuredClone(result.queryContext);
  return { toolName: "get_vehicle_registrations", input: { ...input, page: result.pagination.nextPage } };
};
