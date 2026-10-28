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

  // Inactive rows are logical deletions and must never participate.
  const filters = ["ACTIVO = :active"];
  binds.active = VEHICLE_VALUES.active;

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
    binds.plate = String(plate).replace(/\s+/g, "").toUpperCase();
    if (!binds.plate) throw new Error("La matrícula no puede estar vacía.");

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

  const result = await executeOracleQuery(connection, sql, binds);

  return Array.isArray(result) ? result : [];
};
