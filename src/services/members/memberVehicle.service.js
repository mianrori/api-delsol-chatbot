import { getMemberVehiclesRepository } from "../../repositories/vehicles/vehicle.repository.js";
import { getMemberRepository } from "../../repositories/members/member.repository.js";

const VEHICLE_VALUES = {
  active: "S",
  automaticDebit: "S",
};

const mapVehicle = (row) => ({
  plate: row.MATRICULA ?? null,

  brand: row.MARCA ?? null,

  model: row.MODELO ?? null,

  color: row.COLOR ?? null,

  active: row.ACTIVO === VEHICLE_VALUES.active,

  status: row.ACTIVO === VEHICLE_VALUES.active ? "Activo" : "Inactivo",

  automaticDebit: row.DEBITO_AUTOMATICO === VEHICLE_VALUES.automaticDebit,

  registrationDate: row.FECHA_ALTA ?? null,
});

const mapOwner = (member, vehicle) => {
  if (!member) {
    return {
      documentNumber: vehicle.COD_SOCIO ? String(vehicle.COD_SOCIO) : null,

      fullName: vehicle.NOM_SOCIO ?? null,
    };
  }

  return {
    documentNumber: member.COD_SOCIO ? String(member.COD_SOCIO) : null,

    fullName: member.NOMBRE_COMPLETO ?? vehicle.NOM_SOCIO ?? null,

    email: member.EMAIL ?? null,

    phone: member.TELEFONO ?? null,

    gender: member.GENERO ?? null,

    category: member.CATEGORIA ?? null,

    active: member.ACTIVO === "S",

    registrationDate: member.FECHA_ALTA ?? null,

    birthDate: member.FECHA_NACIMIENTO ?? null,

    observation: member.OBSERVACION ?? null,

    receivesTelemarketing: member.RECIBE_TELEMARKETING ?? null,

    generatesCoupon: member.GENERA_CUPON ?? null,
  };
};

export const getMemberVehicles = async (args, connection) => {
  const rows = await getMemberVehiclesRepository({
    connection,
    ...args,
  });

  /*
   * -------------------------------------------------------------
   * Sin resultados
   * -------------------------------------------------------------
   */

  if (!rows.length) {
    return {
      status: "NOT_FOUND",

      documentNumber: args.documentNumber ? String(args.documentNumber) : null,

      plate: args.plate ?? null,

      summary: {
        total: 0,
        active: 0,
        inactive: 0,
      },

      vehicles: [],
    };
  }

  /*
   * -------------------------------------------------------------
   * Consulta directa por matrícula / chapa
   * -------------------------------------------------------------
   *
   * Si el usuario proporcionó plate, el vehículo
   * ya contiene COD_SOCIO.
   *
   * No ejecutamos search_members.
   *
   * Reutilizamos COD_SOCIO directamente para obtener
   * los datos completos del propietario.
   */

  if (args.plate) {
    const documents = new Set(rows.map((row) => row.COD_SOCIO == null ? null : String(row.COD_SOCIO)));
    if (documents.size > 1) return {
      status: "AMBIGUOUS",
      registrations: rows.map((row) => ({ owner: mapOwner(null, row), vehicle: mapVehicle(row) })),
    };
    const vehicleRow = rows[0];

    const member = vehicleRow.COD_SOCIO
      ? await getMemberRepository(connection, vehicleRow.COD_SOCIO)
      : null;

    return {
      status: "FOUND",

      owner: mapOwner(member, vehicleRow),

      vehicle: mapVehicle(vehicleRow),
    };
  }

  /*
   * -------------------------------------------------------------
   * Consulta tradicional por socio
   * -------------------------------------------------------------
   */

  const vehicles = rows.map(mapVehicle);

  const activeCount = vehicles.filter((vehicle) => vehicle.active).length;

  const inactiveCount = vehicles.length - activeCount;

  return {
    status: "FOUND",

    documentNumber: args.documentNumber ? String(args.documentNumber) : null,

    summary: {
      total: vehicles.length,

      active: activeCount,

      inactive: inactiveCount,
    },

    vehicles,
  };
};
