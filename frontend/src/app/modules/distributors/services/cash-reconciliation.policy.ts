export interface KnownCashInput {
  openingAmount: number;
  confirmedCollections: number;
  operatingExpenses: number;
}

/**
 * Cash is reconciled only from evidence that represents money. Product loads,
 * returns and losses are inventory evidence and must never be treated as cash
 * sales merely because they have a valuation.
 */
export function calculateKnownExpectedCash(input: KnownCashInput): number {
  const values = [input.openingAmount, input.confirmedCollections, input.operatingExpenses];
  if (!values.every(Number.isFinite) || values.some((value) => value < 0)) {
    throw new Error('Los componentes de caja deben ser montos finitos no negativos.');
  }
  return input.openingAmount + input.confirmedCollections - input.operatingExpenses;
}
