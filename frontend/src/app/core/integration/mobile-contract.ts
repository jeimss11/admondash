/**
 * Read-only boundary for the existing impresora Firestore format.
 * No Firebase imports, network requests, writes, currency rounding or stock effects.
 * See docs/integration/FIRESTORE_CONTRACT.md before adding a writer.
 */
export interface ContractIssue {
  field: string;
  code: 'missing-value' | 'identity-mismatch' | 'numeric-storage-type';
}

export interface ContractRead<T> {
  value: T;
  issues: ContractIssue[];
}

export const MOBILE_DOCUMENT_ID_FIELD = '__admonDashDocumentId';

export interface RejectedMobileDocument {
  documentId: string;
  field: string;
  reason: 'invalid-contract' | 'missing-document-id' | 'unexpected-document';
}

export interface MobileCollectionResult<T> {
  records: ContractRead<T>[];
  rejected: RejectedMobileDocument[];
}

export type ContractReader<T> = (documentId: string, data: unknown) => ContractRead<T>;

export class MobileContractError extends Error {
  readonly field: string;

  constructor(field: string, expected: string) {
    // Do not include customer data or document contents in errors/logs.
    super(`Invalid mobile field ${field}: expected ${expected}`);
    this.name = 'MobileContractError';
    this.field = field;
  }
}

interface MobileDocument {
  documentId: string;
  deleted: boolean | null;
  lastModified: unknown;
}

export interface MobileSale extends MobileDocument {
  sourceCollection: 'ventas';
  invoiceNumber: string;
  customer: string;
  businessDate: string;
  displayDate: string;
  sellerRole: string | null;
  paymentStatus: 'paid' | 'unpaid' | 'unknown';
  subtotal: string | null;
  discountAmount: string | null;
  total: string | null;
  lines: { name: string; quantity: string; lineAmount: string }[];
}

export interface MobileProduct extends MobileDocument {
  code: string;
  name: string;
  unitPrice: string;
  stock: string | null;
}

export interface MobileClient extends MobileDocument {
  local: string;
  name: string;
  address: string;
  phone: string;
}

export interface MobileExpense extends MobileDocument {
  expenseId: string;
  description: string;
  amount: number;
  category: string;
  businessDate: string;
  displayDate: string;
  notes: string;
  sellerRole: string | null;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileContractError(field, 'object');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, nonEmpty = false): string {
  if (typeof value !== 'string' || (nonEmpty && value.trim().length === 0)) {
    throw new MobileContractError(field, nonEmpty ? 'non-empty string' : 'string');
  }
  return value;
}

function missing(value: unknown): boolean {
  return value === undefined || value === null;
}

function optionalText(
  value: unknown,
  field: string,
  issues: ContractIssue[]
): string | null {
  if (missing(value)) {
    issues.push({ field, code: 'missing-value' });
    return null;
  }
  return text(value, field);
}

function optionalBoolean(
  value: unknown,
  field: string,
  issues: ContractIssue[]
): boolean | null {
  if (missing(value)) {
    issues.push({ field, code: 'missing-value' });
    return null;
  }
  if (typeof value !== 'boolean') throw new MobileContractError(field, 'boolean');
  return value;
}

/** Preserve exact decimal text, including scientific notation emitted by Java Double. */
function decimal(value: unknown, field: string, issues: ContractIssue[]): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MobileContractError(field, 'finite decimal');
    issues.push({ field, code: 'numeric-storage-type' });
    return String(value);
  }
  const result = text(value, field).trim();
  if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(result)) {
    throw new MobileContractError(field, 'decimal without currency or grouping separators');
  }
  return result;
}

function optionalDecimal(
  value: unknown,
  field: string,
  issues: ContractIssue[]
): string | null {
  if (missing(value) || value === '') {
    issues.push({ field, code: 'missing-value' });
    return null;
  }
  return decimal(value, field, issues);
}

/** Parse a civil date without Date/UTC conversion or ambiguous display-date fallbacks. */
function businessDate(value: unknown, field: string, compact: boolean): string {
  const input = text(value, field);
  const match = (compact ? /^(\d{4})(\d{2})(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/).exec(input);
  if (!match) throw new MobileContractError(field, compact ? 'yyyyMMdd' : 'yyyy-MM-dd');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new MobileContractError(field, 'valid calendar date');
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function identity(documentId: string, value: string, field: string, issues: ContractIssue[]): void {
  text(documentId, 'documentId', true);
  if (documentId !== value) issues.push({ field, code: 'identity-mismatch' });
}

function metadata(
  documentId: string,
  data: Record<string, unknown>,
  issues: ContractIssue[]
): MobileDocument {
  if (missing(data['ultima_modificacion'])) {
    issues.push({ field: 'ultima_modificacion', code: 'missing-value' });
  }
  return {
    documentId,
    deleted: optionalBoolean(data['eliminado'], 'eliminado', issues),
    // The repository handles Firestore Timestamp conversion; never synthesize Date.now().
    lastModified: data['ultima_modificacion'] ?? null,
  };
}

export function readMobileSale(documentId: string, input: unknown): ContractRead<MobileSale> {
  const data = record(input, 'sale');
  const issues: ContractIssue[] = [];
  const invoiceNumber = text(data['factura'], 'factura', true);
  identity(documentId, invoiceNumber, 'factura', issues);
  const products = data['productos'];
  if (!Array.isArray(products) || products.length === 0) {
    throw new MobileContractError('productos', 'non-empty array');
  }
  const paid = optionalBoolean(data['pagado'], 'pagado', issues);
  return {
    value: {
      ...metadata(documentId, data, issues),
      // Existing web distributor code also wrote here; this does not prove authorship.
      sourceCollection: 'ventas',
      invoiceNumber,
      customer: optionalText(data['cliente'], 'cliente', issues) ?? '',
      businessDate: businessDate(data['fecha2'], 'fecha2', false),
      displayDate: optionalText(data['fecha'], 'fecha', issues) ?? '',
      sellerRole: optionalText(data['role'], 'role', issues),
      paymentStatus: paid === null ? 'unknown' : paid ? 'paid' : 'unpaid',
      subtotal: optionalDecimal(data['subtotal'], 'subtotal', issues),
      discountAmount: optionalDecimal(data['descuento'], 'descuento', issues),
      total: optionalDecimal(data['total'], 'total', issues),
      lines: products.map((product, index) => {
        const row = record(product, `productos[${index}]`);
        return {
          name: text(row['nombre'], `productos[${index}].nombre`),
          quantity: decimal(row['cantidad'], `productos[${index}].cantidad`, issues),
          lineAmount: decimal(row['precio'], `productos[${index}].precio`, issues),
        };
      }),
    },
    issues,
  };
}

export function readMobileProduct(documentId: string, input: unknown): ContractRead<MobileProduct> {
  const data = record(input, 'product');
  const issues: ContractIssue[] = [];
  const code = text(data['codigo'], 'codigo', true);
  identity(documentId, code, 'codigo', issues);
  return {
    value: {
      ...metadata(documentId, data, issues),
      code,
      name: text(data['nombre'], 'nombre'),
      unitPrice: decimal(data['valor'], 'valor', issues),
      stock: optionalDecimal(data['cantidad'], 'cantidad', issues),
    },
    issues,
  };
}

export function readMobileClient(documentId: string, input: unknown): ContractRead<MobileClient> {
  const data = record(input, 'client');
  const issues: ContractIssue[] = [];
  const local = text(data['local'], 'local', true);
  identity(documentId, local, 'local', issues);
  return {
    value: {
      ...metadata(documentId, data, issues),
      local,
      name: optionalText(data['cliente'], 'cliente', issues) ?? '',
      address: optionalText(data['direccion'], 'direccion', issues) ?? '',
      phone: optionalText(data['telefono'], 'telefono', issues) ?? '',
    },
    issues,
  };
}

export function readMobileExpense(documentId: string, input: unknown): ContractRead<MobileExpense> {
  const data = record(input, 'expense');
  const issues: ContractIssue[] = [];
  const expenseId = optionalText(data['expense_id'], 'expense_id', issues) ?? documentId;
  identity(documentId, expenseId, 'expense_id', issues);
  const amount = data['amount'];
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new MobileContractError('amount', 'finite number');
  }
  return {
    value: {
      ...metadata(documentId, data, issues),
      expenseId,
      description: optionalText(data['description'], 'description', issues) ?? '',
      amount,
      category: optionalText(data['category'], 'category', issues) ?? '',
      businessDate: businessDate(data['date2'], 'date2', true),
      displayDate: optionalText(data['date'], 'date', issues) ?? '',
      notes: optionalText(data['notes'], 'notes', issues) ?? '',
      sellerRole: optionalText(data['role'], 'role', issues),
    },
    issues,
  };
}

/**
 * Converts a Firestore collection snapshot without allowing one malformed legacy
 * record to hide the rest of the business data. It never writes, creates a
 * seller, or replaces a mobile document.
 */
export function readMobileCollection<T>(
  documents: readonly unknown[],
  reader: ContractReader<T>
): MobileCollectionResult<T> {
  const records: ContractRead<T>[] = [];
  const rejected: RejectedMobileDocument[] = [];

  for (const document of documents) {
    const data = document as Record<string, unknown> | null;
    const documentId = data?.[MOBILE_DOCUMENT_ID_FIELD];

    if (typeof documentId !== 'string' || documentId.trim().length === 0) {
      rejected.push({
        documentId: '',
        field: MOBILE_DOCUMENT_ID_FIELD,
        reason: 'missing-document-id',
      });
      continue;
    }

    try {
      records.push(reader(documentId, data));
    } catch (error) {
      if (error instanceof MobileContractError) {
        rejected.push({ documentId, field: error.field, reason: 'invalid-contract' });
      } else {
        rejected.push({ documentId, field: 'document', reason: 'unexpected-document' });
      }
    }
  }

  return { records, rejected };
}
