export const getVehicleRegistrationsTool = {
  toolSpec: {
    name: "get_vehicle_registrations",
    description: "Consulta únicamente registros ACTIVO=S (los inactivos son borrados lógicos) por FECHA_ALTA, cantidades y matrículas únicas, detalle paginado y segmentación por datos del socio. No requiere resolver un socio. No mide entradas al estacionamiento ni acredita propiedad legal.",
    inputSchema: { json: { type: "object", properties: {
      relativePeriod: { type: "string", enum: ["today", "yesterday", "thisWeek", "thisMonth", "thisYear"], description: "Hoy, ayer, esta semana, este mes o este año. El backend usa el calendario de Paraguay. No combinar con fechas explícitas." },
      dateFrom: { type: "string", description: "Inicio inclusivo de fecha de registro DD/MM/YYYY." },
      dateTo: { type: "string", description: "Fin inclusivo de fecha de registro DD/MM/YYYY." },
      mode: { type: "string", enum: ["summary", "detail"] },
      groupBy: { type: "array", items: { type: "string", enum: ["day", "month", "year", "gender", "age", "ageRange", "brand", "model", "color", "active", "automaticDebit"] }, description: "Por género, edad exacta, rangos 0-17/18-29/30-39/40-49/50-59/60+, fechas o características del vehículo." },
      gender: { type: "string", enum: ["male", "female", "unknown"] },
      ageMin: { type: "integer", minimum: 0, maximum: 120 }, ageMax: { type: "integer", minimum: 0, maximum: 120 },
      ageReference: { type: "string", enum: ["current", "registration"], description: "current por defecto: edad del socio a la fecha actual de Paraguay. registration si solicita edad al registrar el vehículo." },
      referenceDate: { type: "string", description: "Fecha DD/MM/YYYY para edad current solo si el usuario la especifica; al paginar conservar la devuelta en queryContext." },
      active: { type: "boolean", enum: [true], description: "Solo true: ACTIVO=S es obligatorio; los inactivos son borrados lógicos." },
      automaticDebit: { type: "boolean" }, brand: { type: "string" }, model: { type: "string" }, color: { type: "string" },
      page: { type: "integer", minimum: 1 }, rows: { type: "integer", minimum: 1, maximum: 100 },
    }, required: [], additionalProperties: false } },
  },
};
