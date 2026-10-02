import { searchCustomersRepository } from "../../repositories/customers/customer.repository.js";

const mapCustomer = (customer) => ({
  codCliente: String(customer.COD_CLIENTE),
  name: customer.NOMBRE_FANTASIA,
  businessName: customer.RAZON_SOCIAL ?? null,
  hasActiveContract: customer.CONTRATO_ACTIVO === "S",
});

export const resolveCustomer = async (search, connection) => {
  const customers = await searchCustomersRepository(connection, search);

  if (!customers || customers.length === 0) {
    return {
      status: "NOT_FOUND",
      query: search,
      options: [],
    };
  }

  if (customers.length === 1 || Number(customers[0].SIMILARITY) === 100) {
    return {
      status: "RESOLVED",
      customer: mapCustomer(customers[0]),
    };
  }

  return {
    status: "AMBIGUOUS",
    query: search,
    options: customers.map((customer, index) => ({
      optionId: String(index + 1),
      ...mapCustomer(customer),
    })),
  };
};
