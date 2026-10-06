import {
  getActiveContractsRepository,
  getContractByIdentityRepository,
} from "../../repositories/contracts/contracts.repository.js";

import { getContractConceptsRepository } from "../../repositories/contracts/contractConcepts.repository.js";
import { getLatestBilledAmountsByConceptRepository } from "../../repositories/contracts/contractInvoiceAmounts.repository.js";
import { contractBusinessConfig } from "../../config/contractBusiness.config.js";

const formatIpcFrequency = (months) => {
  if (months === null || months === undefined) {
    return null;
  }

  const value = Number(months);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const labels = {
    1: "Mensual",
    2: "Bimestral",
    3: "Trimestral",
    4: "Cuatrimestral",
    6: "Semestral",
    12: "Anual",
  };

  return labels[value] ?? `Cada ${value} meses`;
};

const formatYesNo = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();

  if (normalized === "S") return "Sí";
  if (normalized === "N") return "No";

  return null;
};

const attachLastBilledAmounts = ({ concepts, billedAmounts }) => {
  const billedMap = new Map(
    billedAmounts.map((item) => [String(item.conceptCode), item]),
  );

  return concepts.map((concept) => {
    const billed = billedMap.get(String(concept.conceptCode)) ?? null;

    return {
      ...concept,

      ipcFrequencyDescription: formatIpcFrequency(concept.ipcFrequency),

      percentageRent: formatYesNo(concept.percentageRentFlag),

      lastBilled: billed
        ? {
            amountExcludingTax: billed.amountExcludingTax,
            amountIncludingTax: billed.amountIncludingTax,
            taxAmount: billed.taxAmount,
            currencySymbol: billed.currencySymbol,
            billingPeriod: billed.billingPeriod,
            invoiceDate: billed.invoiceDate,
            invoiceNumber: billed.invoiceNumber,
          }
        : null,
    };
  });
};

export const getContractConditions = async (
  {
    customerId,
    localNumber,
    contractType,
    contractSeries,
    contractNumber,
    includeConcepts = true,
    includeLastBilledAmounts = true,
  },
  connection,
) => {
  if (!customerId) {
    throw new Error("customerId es obligatorio.");
  }

  let contract = null;

  const hasExactIdentity =
    contractType &&
    contractSeries &&
    contractNumber !== undefined &&
    contractNumber !== null;

  if (hasExactIdentity) {
    contract = await getContractByIdentityRepository({
      connection,
      contractType,
      contractSeries,
      contractNumber,
    });

    if (!contract || String(contract.customerId) !== String(customerId)) {
      return {
        status: "NOT_FOUND",
      };
    }
  } else {
    const contracts = await getActiveContractsRepository({
      connection,
      customerId,
      localNumber,
      contractType: contractBusinessConfig.currentContract.contractType,
      activeStatus: contractBusinessConfig.currentContract.activeStatus,
    });

    if (contracts.length === 0) {
      return {
        status: "NOT_FOUND",
      };
    }

    if (contracts.length > 1) {
      return {
        status: "AMBIGUOUS",

        contracts: contracts.map((item, index) => ({
          option: index + 1,
          customerId: item.customerId,
          customerName: item.customerName,
          localNumber: item.localNumber,
          contract: item.contract,
          contractDate: item.contractDate,
          expirationDate: item.expirationDate,
        })),
      };
    }

    [contract] = contracts;
  }

  if (!includeConcepts) {
    return {
      status: "RESOLVED",
      contract,
      concepts: [],
    };
  }

  const concepts = await getContractConceptsRepository({
    connection,
    contractType: contract.contract.type,
    contractSeries: contract.contract.series,
    contractNumber: contract.contract.number,
  });

  let resolvedConcepts = concepts.map((concept) => ({
    ...concept,

    ipcFrequencyDescription: formatIpcFrequency(concept.ipcFrequency),

    percentageRent: formatYesNo(concept.percentageRentFlag),
  }));

  if (includeLastBilledAmounts && concepts.length > 0) {
    const billedAmounts = await getLatestBilledAmountsByConceptRepository({
      connection,
      customerId: contract.customerId,
      conceptCodes: concepts.map((concept) => concept.conceptCode),
    });

    resolvedConcepts = attachLastBilledAmounts({
      concepts,
      billedAmounts,
    });
  }

  return {
    status: "RESOLVED",

    contract,

    concepts: resolvedConcepts,

    queryContext: {
      billedAmountRule: includeLastBilledAmounts
        ? "latestInvoiceByCustomerAndConceptExcludingTax"
        : null,
    },
  };
};
