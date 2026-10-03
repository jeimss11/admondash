import { buildSnapshot } from './mobile-dashboard.service';

describe('Dashboard totals with synthetic history', () => {
  const empty = () => ({ records: [], rejected: [] });
  const data = () => ({ sales: empty(), products: empty(), clients: empty(), expenses: empty(), webSales: [] }) as any;
  const sale = (total: string | null) => ({ value: { deleted: false, total, lines: [] }, issues: [] });
  it('adds known decimal amounts exactly without binary rounding', () => {
    const input = data(); input.sales.records = [sale('0.1'), sale('0.2')];
    const snapshot = buildSnapshot(input, '2026-10-02');
    expect(snapshot.metrics[0].value).toBe('COP 0,3');
  });
  it('never presents a partial sales sum as the consolidated total', () => {
    const input = data(); input.sales.records = [sale('100'), sale(null)];
    const snapshot = buildSnapshot(input, '2026-10-02');
    expect(snapshot.metrics[0].value).toBe('No disponible');
    expect(snapshot.metrics[1].value).toBe('No disponible');
    expect(snapshot.metrics[2].value).toBe('COP 0');
  });
  it('does not report rejected expenses as zero', () => {
    const input = data(); input.expenses.rejected = [{ documentId: 'bad', field: 'monto', reason: 'invalid-contract' }];
    expect(buildSnapshot(input, '2026-10-02').metrics[3].value).toBe('No disponible');
  });
  it('bounds invalid scientific exponents rather than allocating an unbounded number', () => {
    const input = data(); input.sales.records = [sale('1e99999999')];
    expect(() => buildSnapshot(input, '2026-10-02')).toThrowError(/rango/);
  });
});
