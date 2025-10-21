import { Injectable, computed, inject } from '@angular/core';
import { EstadisticasProveedor, FacturaProveedor, Supplier } from '../models/supplier.models';
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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const paidThisMonth = invoices
      .filter(
        (factura) =>
          factura.estado === 'pagada' && factura.pagos?.some((pago) => pago.fecha >= startOfMonth)
      )
      .reduce((sum, factura) => sum + factura.monto, 0);

    const overdueInvoices = invoices.filter(
      (factura) =>
        factura.estado !== 'pagada' && factura.fechaVencimiento && factura.fechaVencimiento < now
    ).length;

    // Calcular deuda total desde las facturas
    const totalDebt = invoices
      .filter((factura) => factura.estado !== 'pagada')
      .reduce((sum, factura) => sum + (factura.monto - (factura.montoPagado || 0)), 0);

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
          .filter((inv) => inv.estado !== 'pagada')
          .reduce((sum, inv) => sum + (inv.monto - (inv.montoPagado || 0)), 0);

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
          .filter((inv) => inv.estado !== 'pagada')
          .reduce((sum, inv) => sum + (inv.monto - (inv.montoPagado || 0)), 0);

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
    const monthlyData: { [key: string]: { paid: number; pending: number; overdue: number } } = {};

    // Inicializar últimos 12 meses
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
      monthlyData[key] = { paid: 0, pending: 0, overdue: 0 };
    }

    invoices.forEach((factura) => {
      const monthKey = factura.fechaEmision.toLocaleDateString('es-ES', {
        month: 'short',
        year: 'numeric',
      });

      if (monthlyData[monthKey]) {
        if (factura.estado === 'pagada') {
          monthlyData[monthKey].paid += factura.monto;
        } else if (factura.estado === 'vencida') {
          monthlyData[monthKey].overdue += factura.monto;
        } else {
          monthlyData[monthKey].pending += factura.monto;
        }
      }
    });

    return monthlyData;
  }

  getPaymentTrends(days: number = 30): { labels: string[]; data: number[] } {
    const invoices = this.invoicesService.facturas();
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
    invoices.forEach((factura) => {
      factura.pagos?.forEach((pago) => {
        const paymentDate = pago.fecha.toISOString().split('T')[0];
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
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = 0;
    }

    // Sumar pagos por mes
    invoices.forEach((factura) => {
      factura.pagos?.forEach((pago) => {
        const monthKey = `${pago.fecha.getFullYear()}-${String(pago.fecha.getMonth() + 1).padStart(
          2,
          '0'
        )}`;
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
