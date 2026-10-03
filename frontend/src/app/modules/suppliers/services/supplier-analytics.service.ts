import { Injectable, computed, inject } from '@angular/core';
import { EstadisticasProveedor, FacturaProveedor, Supplier } from '../models/supplier.models';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SuppliersService } from './suppliers.service';
import { getOutstandingSupplierBalance } from './supplier-finance.policy';
import { businessDate, DEFAULT_BUSINESS_LOCALE } from '../../../core/integration/business-date';

@Injectable({
  providedIn: 'root',
})
export class SupplierAnalyticsService {
  private suppliersService = inject(SuppliersService);
  private invoicesService = inject(SupplierInvoicesService);

  // Computed signals para estadísticas reactivas
  readonly supplierStats = computed(() => {
    const suppliers = this.suppliersService.suppliers();
    const invoices = this.invoicesService.facturas();

    return this.calculateSupplierStats(suppliers, invoices);
  });

  readonly monthlyStats = computed(() => {
    const invoices = this.invoicesService.facturas();
    return this.calculateMonthlyStats(invoices);
  });

  readonly topDebtors = computed(() => {
    const suppliers = this.suppliersService.suppliers();
    const invoices = this.invoicesService.facturas();
    return this.calculateTopDebtors(suppliers, invoices);
  });

  readonly overdueInvoices = computed(() => {
    return this.invoicesService.getFacturasVencidas();
  });

  readonly pendingPayments = computed(() => {
    const suppliers = this.suppliersService.suppliers();
    const invoices = this.invoicesService.facturas();
    return this.calculatePendingPayments(suppliers, invoices);
  });

  private calculateSupplierStats(
    suppliers: Supplier[],
    invoices: FacturaProveedor[]
  ): EstadisticasProveedor {
    const now = new Date();
    const currentMonth = businessDate(now).slice(0, 7);

    const paidThisMonth = invoices
      .reduce(
        (sum, factura) =>
          sum + (factura.pagos ?? []).reduce((total, payment) =>
            businessDate(payment.fecha).slice(0, 7) === currentMonth ? total + payment.monto : total, 0),
        0
      );

    const overdueInvoices = invoices.filter(
      (factura) =>
        factura.estado !== 'pagada' && factura.estado !== 'anulada' && factura.fechaVencimiento && factura.fechaVencimiento < now
    ).length;

    // Calcular deuda total desde las facturas
    const totalDebt = invoices
      .reduce((sum, factura) => sum + getOutstandingSupplierBalance(factura), 0);

    // Calcular facturas pendientes
    const pendingInvoices = invoices.filter(
      (f) => f.estado === 'pendiente' || f.estado === 'parcial'
    ).length;

    return {
      totalProveedores: suppliers.length,
      proveedoresActivos: suppliers.filter((s) => s.estado === 'activo').length,
      deudaTotal: totalDebt,
      pagadoMes: paidThisMonth,
      facturasPendientes: pendingInvoices,
      facturasVencidas: overdueInvoices,
    };
  }

  private calculateTopDebtors(suppliers: Supplier[], invoices: FacturaProveedor[]): Supplier[] {
    return suppliers
      .map((supplier) => {
        const supplierInvoices = invoices.filter((inv) => inv.proveedorId === supplier.id);
        const pendingAmount = supplierInvoices
          .reduce((sum, inv) => sum + getOutstandingSupplierBalance(inv), 0);

        return {
          ...supplier,
          deuda_total: pendingAmount,
          pendiente: pendingAmount,
        };
      })
      .filter((s) => (s.pendiente || 0) > 0)
      .sort((a, b) => (b.pendiente || 0) - (a.pendiente || 0))
      .slice(0, 5);
  }

  private calculatePendingPayments(
    suppliers: Supplier[],
    invoices: FacturaProveedor[]
  ): Supplier[] {
    return suppliers
      .map((supplier) => {
        const supplierInvoices = invoices.filter((inv) => inv.proveedorId === supplier.id);
        const pendingAmount = supplierInvoices
          .reduce((sum, inv) => sum + getOutstandingSupplierBalance(inv), 0);

        return {
          ...supplier,
          pendiente: pendingAmount,
        };
      })
      .filter((s) => (s.pendiente || 0) > 0)
      .sort((a, b) => (b.pendiente || 0) - (a.pendiente || 0));
  }

  private calculateMonthlyStats(invoices: FacturaProveedor[]) {
    const now = new Date();
    const [year, month] = businessDate(now).slice(0, 7).split('-').map(Number);
    const monthlyData: { [key: string]: { paid: number; pending: number; overdue: number } } = {};

    // Inicializar últimos 12 meses
    for (let i = 11; i >= 0; i--) {
      const date = new Date(Date.UTC(year, month - 1 - i, 1));
      const key = date.toISOString().slice(0, 7);
      monthlyData[key] = { paid: 0, pending: 0, overdue: 0 };
    }

    invoices.forEach((factura) => {
      if (factura.estado === 'anulada') return;
      const monthKey = businessDate(factura.fechaEmision).slice(0, 7);

      if (monthlyData[monthKey]) {
        const balance = getOutstandingSupplierBalance(factura);
        if (factura.fechaVencimiento && factura.fechaVencimiento < now) monthlyData[monthKey].overdue += balance;
        else monthlyData[monthKey].pending += balance;
      }
      factura.pagos?.forEach(payment => {
        const paymentMonth = businessDate(payment.fecha).slice(0, 7);
        if (monthlyData[paymentMonth]) monthlyData[paymentMonth].paid += payment.monto;
      });
    });

    return Object.fromEntries(Object.entries(monthlyData).map(([key, totals]) => [
      new Intl.DateTimeFormat(DEFAULT_BUSINESS_LOCALE.locale, {
        month:'short',year:'numeric',timeZone:DEFAULT_BUSINESS_LOCALE.timeZone,
      }).format(new Date(`${key}-15T12:00:00Z`)), totals,
    ]));
  }

  getPaymentTrends(days: number = 30): { labels: string[]; data: number[] } {
    const invoices = this.invoicesService.facturas();
    const now = new Date();
    if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('El período de pagos debe ser entre 1 y 366 días.');

    const dailyPayments: { [key: string]: number } = {};
    const labels: string[] = [];
    const data: number[] = [];

    // Inicializar días
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = businessDate(date);
      dailyPayments[key] = 0;
      labels.push(new Intl.DateTimeFormat(DEFAULT_BUSINESS_LOCALE.locale, {
        month:'short',day:'numeric',timeZone:DEFAULT_BUSINESS_LOCALE.timeZone,
      }).format(date));
    }

    // Sumar pagos por día
    invoices.forEach((factura) => {
      factura.pagos?.forEach((pago) => {
        const paymentDate = businessDate(pago.fecha);
        if (dailyPayments[paymentDate] !== undefined) {
          dailyPayments[paymentDate] += pago.monto;
        }
      });
    });

    // Convertir a array
    Object.values(dailyPayments).forEach((amount) => data.push(amount));

    return { labels, data };
  }

  getSupplierPaymentHistory(supplierId: string): { labels: string[]; data: number[] } {
    const invoices = this.invoicesService.getFacturasByProveedor(supplierId);
    const monthlyData: { [key: string]: number } = {};

    // Inicializar últimos 12 meses
    const now = new Date();
    const currentMonth = businessDate(now).slice(0, 7);
    const [businessYear, businessMonth] = currentMonth.split('-').map(Number);
    for (let i = 11; i >= 0; i--) {
      const date = new Date(Date.UTC(businessYear, businessMonth - 1 - i, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = 0;
    }

    // Sumar pagos por mes
    invoices.forEach((factura) => {
      factura.pagos?.forEach((pago) => {
        const monthKey = businessDate(pago.fecha).slice(0, 7);
        if (monthlyData[monthKey] !== undefined) {
          monthlyData[monthKey] += pago.monto;
        }
      });
    });

    const labels = Object.keys(monthlyData).map((key) => {
      const [year, month] = key.split('-');
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('es-ES', {
        month: 'short',
      });
    });

    const data = Object.values(monthlyData);

    return { labels, data };
  }

  getAveragePaymentTime(): number {
    const invoices = this.invoicesService
      .facturas()
      .filter((factura) => factura.estado === 'pagada');

    if (invoices.length === 0) return 0;

    const totalDays = invoices.reduce((sum, factura) => {
      const lastPayment = factura.pagos?.[factura.pagos.length - 1];
      if (lastPayment && factura.fechaVencimiento) {
        const days = Math.ceil(
          (lastPayment.fecha.getTime() - factura.fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24)
        );
        return sum + days;
      }
      return sum;
    }, 0);

    return Math.round(totalDays / invoices.length);
  }

  getSupplierReliabilityScore(supplierId: string): number {
    const invoices = this.invoicesService.getFacturasByProveedor(supplierId);
    if (invoices.length === 0) return 100;

    const paidOnTime = invoices.filter((factura) => {
      if (factura.estado !== 'pagada') return false;
      const lastPayment = factura.pagos?.[factura.pagos.length - 1];
      return (
        lastPayment && factura.fechaVencimiento && lastPayment.fecha <= factura.fechaVencimiento
      );
    }).length;

    return Math.round((paidOnTime / invoices.length) * 100);
  }
}
