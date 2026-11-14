import { getVehicleRegistrationsRepository } from "../../repositories/vehicles/vehicleRegistrations.repository.js";

const periods = new Set(["today", "yesterday", "thisWeek", "thisMonth", "thisYear"]);
export const vehicleDimensions = ["day", "month", "year", "gender", "age", "ageRange", "brand", "model", "color", "active", "automaticDebit"];
const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) throw new Error("Las fechas deben tener formato DD/MM/YYYY.");
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Fecha inválida.");
  return date;
};
const formatDate = (date) => `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
const todayInParaguay = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
};
export const normalizeVehicleRegistrationArgs = (args = {}, today = todayInParaguay()) => {
  const { relativePeriod, dateFrom, dateTo, mode = "summary", groupBy = [], page = 1, rows = 20, gender, ageMin, ageMax, ageReference = "current", referenceDate, active, automaticDebit, brand, model, color } = args;
  if (!periods.has(relativePeriod) && relativePeriod != null) throw new Error("Período relativo inválido.");
  if (relativePeriod != null && (dateFrom != null || dateTo != null)) throw new Error("No combinar período relativo con fechas explícitas.");
  let from, to;
  if (dateFrom != null || dateTo != null) {
    from = parseDate(dateFrom); to = parseDate(dateTo);
  } else {
    if (!relativePeriod) throw new Error("Indica el período de registro.");
    from = new Date(today); to = new Date(today);
    if (relativePeriod === "yesterday") { from.setUTCDate(from.getUTCDate() - 1); to = new Date(from); }
    if (relativePeriod === "thisWeek") from.setUTCDate(from.getUTCDate() - ((from.getUTCDay() + 6) % 7));
    if (relativePeriod === "thisMonth") from.setUTCDate(1);
    if (relativePeriod === "thisYear") from = new Date(Date.UTC(from.getUTCFullYear(), 0, 1));
  }
  if (from > to) throw new Error("La fecha inicial no puede ser posterior a la final.");
  if (!["summary", "detail"].includes(mode)) throw new Error("Modo inválido.");
  if (!Array.isArray(groupBy) || groupBy.some((key) => !vehicleDimensions.includes(key))) throw new Error("Agrupación inválida.");
  if (groupBy.includes("age") && groupBy.includes("ageRange")) throw new Error("Elige edad o rango de edad.");
  if (!["current", "registration"].includes(ageReference)) throw new Error("Referencia de edad inválida.");
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(rows) || rows < 1 || rows > 100 || !Number.isSafeInteger(page * rows)) throw new Error("Paginación inválida.");
  if (gender != null && !["male", "female", "unknown"].includes(gender)) throw new Error("Género inválido.");
  for (const age of [ageMin, ageMax]) if (age != null && (!Number.isInteger(age) || age < 0 || age > 120)) throw new Error("La edad debe estar entre 0 y 120.");
  if (ageMin != null && ageMax != null && ageMin > ageMax) throw new Error("Rango de edad inválido.");
  if (active === false) throw new Error("Los vehículos inactivos son borrados lógicos y no se consultan.");
  for (const flag of [active, automaticDebit]) if (flag != null && typeof flag !== "boolean") throw new Error("Filtro de estado inválido.");
  for (const value of [brand, model, color]) if (value != null && (typeof value !== "string" || !value.trim() || value.length > 100)) throw new Error("Filtro de vehículo inválido.");
  return { dateFrom: formatDate(from), dateTo: formatDate(to), mode, groupBy: [...new Set(groupBy)], page, rows,
    gender: gender ?? null, ageMin: ageMin ?? null, ageMax: ageMax ?? null, ageReference,
    referenceDate: formatDate(referenceDate == null ? today : parseDate(referenceDate)),
    active: true, automaticDebit: automaticDebit ?? null,
    brand: brand?.trim() ?? null, model: model?.trim() ?? null, color: color?.trim() ?? null };
};
const flag = (value) => value === "S" ? true : value === "N" ? false : null;
export const getVehicleRegistrations = async (args = {}, connection) => {
  const filters = normalizeVehicleRegistrationArgs(args);
  const result = await getVehicleRegistrationsRepository({ connection, ...filters });
  return { mode: filters.mode, groupBy: filters.groupBy, queryContext: { ...filters, timezone: "America/Asuncion" }, ...result,
    data: result.data.map((row) => ({ ...row, ...(Object.hasOwn(row, "active") ? { active: flag(row.active) } : {}), ...(Object.hasOwn(row, "automaticDebit") ? { automaticDebit: flag(row.automaticDebit) } : {}) })) };
};
