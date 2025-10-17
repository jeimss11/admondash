import { Injectable, computed, inject } from '@angular/core';
import { Supplier, SupplierInvoice, SupplierStats } from '../models/supplier.models';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SuppliersService } from './suppliers.service';

@Injectable({
  providedIn: 'root',
})
export class SupplierAnalyticsService {
  private suppliersService = inject(SuppliersService);
  private invoicesService = inject(SupplierInvoicesService);

  // Computed signals para estadísticas reactivas
  readonly supplierStats = computed(() => {
    const suppliers = this.suppliersService.suppliers();
    const invoices = this.invoicesService.invoices();

    return this.calculateSupplierStats(suppliers, invoices);
  });

  readonly monthlyStats = computed(() => {
    const invoices = this.invoicesService.invoices();
    return this.calculateMonthlyStats(invoices);
  });

  readonly topDebtors = computed(() => {
    const suppliers = this.suppliersService.suppliers();
    return suppliers
      .filter((s) => s.deuda_total > 0)
      .sort((a, b) => b.deuda_total - a.deuda_total)
      .slice(0, 5);
  });

  readonly overdueInvoices = computed(() => {
    return this.invoicesService.getOverdueInvoices();
  });

  readonly pendingPayments = computed(() => {
    const suppliers = this.suppliersService.suppliers();
    return suppliers.filter((s) => s.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente);
  });

  private calculateSupplierStats(
    suppliers: Supplier[],
    invoices: SupplierInvoice[]
  ): SupplierStats {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const paidThisMonth = invoices
      .filter(
        (invoice) =>
          invoice.status === 'paid' &&
          invoice.payments?.some((payment) => payment.date >= startOfMonth)
      )
      .reduce((sum, invoice) => sum + invoice.amount, 0);

    const overdueInvoices = invoices.filter(
      (invoice) => invoice.status !== 'paid' && invoice.dueDate < now
    ).length;

    return {
      total_proveedores: suppliers.length,
      proveedores_activos: suppliers.filter((s) => s.estado === 'activo').length,
      deuda_total: suppliers.reduce((sum, s) => sum + s.deuda_total, 0),
      pagado_mes: paidThisMonth,
      facturas_pendientes: invoices.filter((i) => i.status === 'pending' || i.status === 'partial')
        .length,
      facturas_vencidas: overdueInvoices,
    };
  }

  private calculateMonthlyStats(invoices: SupplierInvoice[]) {
    const now = new Date();
    const monthlyData: { [key: string]: { paid: number; pending: number; overdue: number } } = {};

    // Inicializar últimos 12 meses
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
      monthlyData[key] = { paid: 0, pending: 0, overdue: 0 };
    }

    invoices.forEach((invoice) => {
      const monthKey = invoice.issueDate.toLocaleDateString('es-ES', {
        month: 'short',
        year: 'numeric',
      });

      if (monthlyData[monthKey]) {
        if (invoice.status === 'paid') {
          monthlyData[monthKey].paid += invoice.amount;
        } else if (invoice.status === 'overdue') {
          monthlyData[monthKey].overdue += invoice.amount;
        } else {
          monthlyData[monthKey].pending += invoice.amount;
        }
      }
    });

    return monthlyData;
  }

  getPaymentTrends(days: number = 30): { labels: string[]; data: number[] } {
    const invoices = this.invoicesService.invoices();
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const dailyPayments: { [key: string]: number } = {};
    const labels: string[] = [];
    const data: number[] = [];

    // Inicializar días
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = date.toISOString().split('T')[0];
      dailyPayments[key] = 0;
      labels.push(date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }));
    }

    // Sumar pagos por día
    invoices.forEach((invoice) => {
      invoice.payments?.forEach((payment) => {
        const paymentDate = payment.date.toISOString().split('T')[0];
        if (dailyPayments[paymentDate] !== undefined) {
          dailyPayments[paymentDate] += payment.amount;
        }
      });
    });

    // Convertir a array
    Object.values(dailyPayments).forEach((amount) => data.push(amount));

    return { labels, data };
  }

  getSupplierPaymentHistory(supplierId: string): { labels: string[]; data: number[] } {
    const invoices = this.invoicesService.getInvoicesBySupplier(supplierId);
    const monthlyData: { [key: string]: number } = {};

    // Inicializar últimos 12 meses
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = 0;
    }

    // Sumar pagos por mes
    invoices.forEach((invoice) => {
      invoice.payments?.forEach((payment) => {
        const monthKey = `${payment.date.getFullYear()}-${String(
          payment.date.getMonth() + 1
        ).padStart(2, '0')}`;
        if (monthlyData[monthKey] !== undefined) {
          monthlyData[monthKey] += payment.amount;
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
    const invoices = this.invoicesService.invoices().filter((invoice) => invoice.status === 'paid');

    if (invoices.length === 0) return 0;

    const totalDays = invoices.reduce((sum, invoice) => {
      const lastPayment = invoice.payments?.[invoice.payments.length - 1];
      if (lastPayment) {
        const days = Math.ceil(
          (lastPayment.date.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        return sum + days;
      }
      return sum;
    }, 0);

    return Math.round(totalDays / invoices.length);
  }

  getSupplierReliabilityScore(supplierId: string): number {
    const invoices = this.invoicesService.getInvoicesBySupplier(supplierId);
    if (invoices.length === 0) return 100;

    const paidOnTime = invoices.filter((invoice) => {
      if (invoice.status !== 'paid') return false;
      const lastPayment = invoice.payments?.[invoice.payments.length - 1];
      return lastPayment && lastPayment.date <= invoice.dueDate;
    }).length;

    return Math.round((paidOnTime / invoices.length) * 100);
  }
}
