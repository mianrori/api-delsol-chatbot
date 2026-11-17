import { searchCustomersRepository } from "../../repositories/customers/customer.repository.js";

const mapCustomer = (customer) => ({
  codCliente: String(customer.COD_CLIENTE),
  name: customer.NOMBRE_FANTASIA,
  businessName: customer.RAZON_SOCIAL ?? null,
  hasActiveContract: customer.CONTRATO_ACTIVO === "S",
});

const isExactMatch = (customer) =>
  customer?.EXACT_MATCH!=null ? Number(customer.EXACT_MATCH)===1 : Number(customer?.SIMILARITY) === 100;

const hasActiveContract = (customer) =>
  customer?.CONTRATO_ACTIVO === "S";

export const resolveCustomer = async (search, connection) => {
  const customers = await searchCustomersRepository(connection, search);

  if (!customers || customers.length === 0) {
    return {
      status: "NOT_FOUND",
      query: search,
      options: [],
    };
  }

  /*
   * Para resolver locales comerciales solo consideramos clientes
   * con contrato activo.
   *
   * Esto evita que una coincidencia histórica/inactiva desplace
   * a un local actualmente vigente con el mismo nombre comercial.
   */
  const activeCustomers = customers.filter(hasActiveContract);

  if (activeCustomers.length === 0) {
    return {
      status: "NOT_FOUND",
      reason: "NO_ACTIVE_CONTRACT",
      query: search,
      options: [],
    };
  }

  /*
   * Una coincidencia exacta solo puede resolverse automáticamente
   * cuando existe exactamente una entre los clientes activos.
   *
   * Si existen dos o más coincidencias exactas (por ejemplo varios
   * locales NIKE activos), debe mantenerse la ambigüedad.
   */
  const exactMatches = activeCustomers.filter(isExactMatch);
  const totalMatches=Number(customers[0].TOTAL_MATCHES??activeCustomers.length);
  const exactCount=Number(customers[0].EXACT_MATCH_COUNT??exactMatches.length);
  const candidates=exactCount>0?exactMatches:activeCustomers;
  const count=exactCount||totalMatches;
  const metadata={totalMatches:count,returnedMatches:candidates.length,hasMore:count>candidates.length};

  if (exactCount === 1 && exactMatches.length === 1) {
    return {
      status: "RESOLVED",
      ...metadata,
      customer: mapCustomer(exactMatches[0]),
    };
  }

  if (exactCount > 1) {
    return {
      status: "AMBIGUOUS",
      ...metadata,
      query: search,
      options: exactMatches.map((customer, index) => ({
        optionId: String(index + 1),
        ...mapCustomer(customer),
      })),
    };
  }

  /*
   * Sin coincidencias exactas:
   * - una sola coincidencia activa puede resolverse;
   * - varias coincidencias activas requieren selección del usuario.
   */
  if (totalMatches === 1 && activeCustomers.length === 1) {
    return {
      status: "RESOLVED",
      ...metadata,
      customer: mapCustomer(activeCustomers[0]),
    };
  }

  return {
    status: "AMBIGUOUS",
    ...metadata,
    query: search,
    options: activeCustomers.map((customer, index) => ({
      optionId: String(index + 1),
      ...mapCustomer(customer),
    })),
  };
};
