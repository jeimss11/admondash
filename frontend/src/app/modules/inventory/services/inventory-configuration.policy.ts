export type InventoryMode = 'central' | 'by-seller';

export interface InventoryConfiguration {
  mode: InventoryMode;
  lowStockThreshold: number;
  country: string;
  locale: string;
  currency: string;
  timeZone: string;
}

export const DEFAULT_INVENTORY_CONFIGURATION: InventoryConfiguration = {
  mode: 'central',
  lowStockThreshold: 5,
  country: 'CO',
  locale: 'es-CO',
  currency: 'COP',
  timeZone: 'America/Bogota',
};

/** Validate a small, explicit configuration surface; historical stock is never reinterpreted. */
export function normalizeInventoryConfiguration(input: Partial<InventoryConfiguration>): InventoryConfiguration {
  const mode = input.mode === 'by-seller' ? 'by-seller' : 'central';
  const threshold = Number(input.lowStockThreshold ?? DEFAULT_INVENTORY_CONFIGURATION.lowStockThreshold);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10_000) {
    throw new Error('El umbral de stock debe ser un número entero entre 0 y 10000.');
  }

  const country = normalizedText(input.country, DEFAULT_INVENTORY_CONFIGURATION.country, 'país');
  const locale = normalizedLocale(input.locale, DEFAULT_INVENTORY_CONFIGURATION.locale);
  const currency = normalizedCurrency(input.currency, DEFAULT_INVENTORY_CONFIGURATION.currency);
  const timeZone = normalizedTimeZone(input.timeZone, DEFAULT_INVENTORY_CONFIGURATION.timeZone);

  return {
    ...DEFAULT_INVENTORY_CONFIGURATION,
    mode,
    lowStockThreshold: threshold,
    country,
    locale,
    currency,
    timeZone,
  };
}

export function requiresSellerAllocation(mode: InventoryMode): boolean {
  return mode === 'by-seller';
}

function normalizedText(value: unknown, fallback: string, label: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El ${label} de negocio no es válido.`);
  return value.trim().toUpperCase();
}

function normalizedLocale(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new Error('El idioma regional de negocio no es válido.');
  try {
    return Intl.getCanonicalLocales(value)[0] ?? fallback;
  } catch {
    throw new Error('El idioma regional de negocio no es válido.');
  }
}

function normalizedCurrency(value: unknown, fallback: string): string {
  const currency = normalizedText(value, fallback, 'moneda');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('La moneda de negocio debe usar un código ISO de tres letras.');
  return currency;
}

function normalizedTimeZone(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw new Error('La zona horaria de negocio no es válida.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value;
  } catch {
    throw new Error('La zona horaria de negocio no es válida.');
  }
}
