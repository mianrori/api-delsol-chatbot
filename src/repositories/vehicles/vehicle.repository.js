import { executeOracleQuery } from "../../database/oracle-query.database.js";

const VEHICLE_VALUES = {
  active: "S",
  inactive: "N",

  automaticDebit: "S",
  noAutomaticDebit: "N",
};

export const getMemberVehiclesRepository = async ({
  connection,

  documentNumber,

  activeOnly = false,

  plate,

  automaticDebit,
}) => {
  /*
   * -------------------------------------------------------------
   * Validación
   * -------------------------------------------------------------
   *
   * Se permite consultar:
   *
   * - por socio;
   * - por matrícula/chapa;
   * - por ambos.
   */
  if (!documentNumber && !plate) {
    throw new Error("Debe proporcionarse documentNumber o plate.");
  }

  /*
   * -------------------------------------------------------------
   * Binds
   * -------------------------------------------------------------
   */

  const binds = {};

  /*
   * -------------------------------------------------------------
   * WHERE
   * -------------------------------------------------------------
   */

  const filters = [];

  /*
   * -------------------------------------------------------------
   * Socio
   * -------------------------------------------------------------
   */

  if (documentNumber) {
    binds.documentNumber = String(documentNumber);

    filters.push(`
      COD_SOCIO = :documentNumber
    `);
  }

  /*
   * -------------------------------------------------------------
   * Matrícula / chapa
   * -------------------------------------------------------------
   */

  if (plate) {
    binds.plate = String(plate).trim().toUpperCase();

    filters.push(`
      UPPER(
        TRIM(MATRICULA)
      ) = :plate
    `);
  }

  /*
   * -------------------------------------------------------------
   * Solo activos
   * -------------------------------------------------------------
   */

  if (activeOnly === true) {
    binds.active = VEHICLE_VALUES.active;

    filters.push(`
      ACTIVO = :active
    `);
  }

  /*
   * -------------------------------------------------------------
   * Débito automático
   * -------------------------------------------------------------
   */

  if (typeof automaticDebit === "boolean") {
    binds.automaticDebit = automaticDebit
      ? VEHICLE_VALUES.automaticDebit
      : VEHICLE_VALUES.noAutomaticDebit;

    filters.push(`
      DEBITO_AUTOMATICO =
      :automaticDebit
    `);
  }

  /*
   * -------------------------------------------------------------
   * SQL
   * -------------------------------------------------------------
   *
   * NOM_SOCIO se incluye para que una consulta directa
   * por matrícula pueda identificar inmediatamente
   * al propietario.
   *
   * Si luego se necesitan datos completos del socio
   * (teléfono, email, etc.), el service puede reutilizar
   * COD_SOCIO directamente con getMemberRepository,
   * sin ejecutar search_members.
   */

  const sql = `
    SELECT
      COD_SOCIO,

      NOM_SOCIO,

      MATRICULA,

      MARCA,

      MODELO,

      COLOR,

      DEBITO_AUTOMATICO,

      ACTIVO,

      TO_CHAR(
        FECHA_ALTA,
        'DD/MM/YYYY'
      ) AS FECHA_ALTA

    FROM
      VW_BOT_VEHICULOS

    WHERE
      ${filters.join("\nAND ")}

    ORDER BY

      /*
       * Prioridad absoluta:
       * vehículos activos primero.
       */

      CASE
        WHEN ACTIVO =
             '${VEHICLE_VALUES.active}'
          THEN 0

        ELSE 1
      END,

      /*
       * Entre vehículos con el mismo estado,
       * mostramos primero los más recientes.
       */

      FECHA_ALTA DESC,

      MATRICULA
  `;

  console.log("getMemberVehiclesRepository SQL:", sql);

  console.log("getMemberVehiclesRepository binds:", binds);

  const result = await executeOracleQuery(connection, sql, binds);

  return Array.isArray(result) ? result : [];
};
