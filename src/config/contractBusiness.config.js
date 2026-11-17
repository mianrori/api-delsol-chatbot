// src/config/contractBusiness.config.js

export const contractBusinessConfig = {
  currentContract: {
    contractType: "CNT",
    activeStatus: "A",
  },

  /*
   * COMPLETAR con los COD_CONCEPTO reales que integran oficialmente
   * "Costo Total Shopping".
   *
   * Ejemplos funcionales del reporte:
   * - Arrendamiento mínimo
   * - Arrendamiento porcentual
   * - Fondo de promoción
   * - Gastos comunes
   * - Cesión de espacio - Valor mínimo
   * - Cesión de espacio - Valor porcentual
   *
   * Nunca inventar códigos.
   */
  incidenceConceptCodes: ["6", "2", "3", "1", "108", "109"],

  maxicambios: {
    url: "https://www.maxicambios.com.py/",
    timeoutMs: 8000,
  },
};
