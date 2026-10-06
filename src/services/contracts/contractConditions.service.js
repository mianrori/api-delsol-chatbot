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

const normalizeCurrencySymbol = (value) => {
  if (value === undefined || value === null || value === "") {
    return value ?? null;
  }

  const normalized = String(value).trim().toUpperCase();

  if (
    ["PYG", "GS", "GS.", "GUARANI", "GUARANIES"].includes(normalized)
  ) {
    return "₲";
  }

  return value;
};

const toTimestamp = (value) => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
};

const isBilledAmountApplicable = ({
  billed,
  contractDate,
  effectiveFrom,
}) => {
  if (!billed?.invoiceDate) {
    return false;
  }

  const invoiceTimestamp = toTimestamp(billed.invoiceDate);

  if (invoiceTimestamp === null) {
    return false;
  }

  const validityDates = [contractDate, effectiveFrom]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (validityDates.length === 0) {
    return true;
  }

  const validFrom = Math.max(...validityDates);

  return invoiceTimestamp >= validFrom;
};

const attachLastBilledAmounts = ({
  concepts,
  billedAmounts,
  contractDate,
}) => {
  const billedMap = new Map(
    billedAmounts.map((item) => [String(item.conceptCode), item]),
  );

  return concepts.map((concept) => {
    const billedCandidate =
      billedMap.get(String(concept.conceptCode)) ?? null;

    const billed = isBilledAmountApplicable({
      billed: billedCandidate,
      contractDate,
      effectiveFrom: concept.effectiveFrom,
    })
      ? billedCandidate
      : null;

    return {
      ...concept,

      ipcFrequencyDescription: formatIpcFrequency(concept.ipcFrequency),

      percentageRent: formatYesNo(concept.percentageRentFlag),

      lastBilled: billed
        ? {
            amountExcludingTax: billed.amountExcludingTax,
            amountIncludingTax: billed.amountIncludingTax,
            taxAmount: billed.taxAmount,
            currencySymbol: normalizeCurrencySymbol(
              billed.currencySymbol,
            ),
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
      contractDate: contract.contractDate,
    });
  }

  return {
    status: "RESOLVED",

    contract,

    concepts: resolvedConcepts,

    queryContext: {
      billedAmountRule: includeLastBilledAmounts
        ? "latestInvoiceByCustomerAndConceptFromCurrentContractValidityExcludingTax"
        : null,
    },
  };
};
