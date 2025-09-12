import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, combineLatest, firstValueFrom, map, of } from 'rxjs';
import {
  DistribuidorEstadisticas,
  DistribuidorProducto,
  DistribuidorVenta,
} from '../models/distributor.models';

@Injectable({ providedIn: 'root' })
export class DistributorsService {
  constructor(private firestore: Firestore, private auth: Auth) {}

  private get userId(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  private get ventasInternasCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/ventas`);
  }

  private get ventasExternasCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/partnerDistributor`);
  }

  // Ventas de distribuidores internos (empleados)
  getVentasInternas(): Observable<DistribuidorVenta[]> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');
    const q = query(this.ventasInternasCollection, where('eliminado', '==', false));
    return collectionData(q, { idField: 'factura' }) as Observable<DistribuidorVenta[]>;
  }

  // Ventas de distribuidores externos (socios)
  getVentasExternas(): Observable<DistribuidorVenta[]> {
    if (!this.ventasExternasCollection) throw new Error('Usuario no autenticado');
    const q = query(this.ventasExternasCollection, where('eliminado', '==', false));
    return collectionData(q, { idField: 'factura' }) as Observable<DistribuidorVenta[]>;
  }

  // Todas las ventas (internas + externas)
  getTodasLasVentas(): Observable<DistribuidorVenta[]> {
    // Por ahora retornamos las internas, pero podríamos combinar ambas
    return this.getVentasInternas();
  }

  async addVentaInterna(
    venta: Omit<DistribuidorVenta, 'id' | 'fecha' | 'fecha2' | 'eliminado' | 'ultima_modificacion'>
  ): Promise<void> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');

    const fechaActual = new Date();
    const nuevaVenta: DistribuidorVenta = {
      ...venta,
      fecha: fechaActual.toLocaleDateString('es-ES').replace(/\//g, '-'),
      fecha2: fechaActual.toISOString().split('T')[0],
      eliminado: false,
      ultima_modificacion: serverTimestamp(),
    };

    const docRef = doc(this.ventasInternasCollection);
    await setDoc(docRef, nuevaVenta);
  }

  async addVentaExterna(
    venta: Omit<DistribuidorVenta, 'id' | 'fecha' | 'fecha2' | 'eliminado' | 'ultima_modificacion'>
  ): Promise<void> {
    if (!this.ventasExternasCollection) throw new Error('Usuario no autenticado');

    const fechaActual = new Date();
    const nuevaVenta: DistribuidorVenta = {
      ...venta,
      fecha: fechaActual.toLocaleDateString('es-ES').replace(/\//g, '-'),
      fecha2: fechaActual.toISOString().split('T')[0],
      eliminado: false,
      ultima_modificacion: serverTimestamp(),
    };

    const docRef = doc(this.ventasExternasCollection);
    await setDoc(docRef, nuevaVenta);
  }

  async updateVentaInterna(venta: DistribuidorVenta): Promise<void> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');
    const docRef = await this.findDocByFactura(this.ventasInternasCollection, venta.factura);
    await updateDoc(docRef, {
      ...venta,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async updateVentaExterna(venta: DistribuidorVenta): Promise<void> {
    if (!this.ventasExternasCollection) throw new Error('Usuario no autenticado');
    const docRef = await this.findDocByFactura(this.ventasExternasCollection, venta.factura);
    await updateDoc(docRef, {
      ...venta,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async deleteVentaInterna(factura: string): Promise<void> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');
    const docRef = await this.findDocByFactura(this.ventasInternasCollection, factura);
    await updateDoc(docRef, {
      eliminado: true,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async deleteVentaExterna(factura: string): Promise<void> {
    if (!this.ventasExternasCollection) throw new Error('Usuario no autenticado');
    const docRef = await this.findDocByFactura(this.ventasExternasCollection, factura);
    await updateDoc(docRef, {
      eliminado: true,
      ultima_modificacion: serverTimestamp(),
    });
  }

  // Método auxiliar para encontrar documento por número de factura
  private async findDocByFactura(
    collection: CollectionReference<DocumentData>,
    factura: string
  ): Promise<any> {
    const q = query(collection, where('factura', '==', factura));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      throw new Error(`No se encontró venta con factura: ${factura}`);
    }

    if (snapshot.size > 1) {
      throw new Error(`Múltiples ventas encontradas con factura: ${factura}`);
    }

    return snapshot.docs[0].ref;
  }

  // Método auxiliar para convertir fecha del formato dd-mm-yyyy a yyyy-mm-dd
  private convertirFechaAlFormato(fechaStr: string): string {
    if (!fechaStr) return '';

    // Si ya está en formato yyyy-mm-dd, devolver como está
    if (fechaStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return fechaStr;
    }

    // Convertir de dd-mm-yyyy a yyyy-mm-dd
    const partes = fechaStr.split('-');
    if (partes.length === 3) {
      const [dia, mes, anio] = partes;
      return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }

    return fechaStr;
  }

  // Estadísticas generales
  getEstadisticasGenerales(): Observable<DistribuidorEstadisticas> {
    if (!this.userId) {
      return of(this.getEstadisticasVacias());
    }

    return combineLatest([
      this.getVentasInternas().pipe(catchError(() => of([]))),
      this.getVentasExternas().pipe(catchError(() => of([]))),
    ]).pipe(
      map(([internas, externas]) => {
        const hoy = new Date();
        const year = hoy.getFullYear();
        const month = String(hoy.getMonth() + 1).padStart(2, '0');
        const day = String(hoy.getDate()).padStart(2, '0');
        const fechaHoy = `${year}-${month}-${day}`;

        // Contar distribuidores únicos por role
        const rolesInternos = new Set(
          internas.map((v) => v.role).filter((role) => role?.startsWith('seller'))
        );
        const rolesExternos = new Set(
          externas.map((v) => v.role).filter((role) => role?.startsWith('clientSeller'))
        );

        // Ventas de hoy
        const ventasHoyInternas = internas.filter((v) => {
          const fechaAUsar = v.fecha2 || this.convertirFechaAlFormato(v.fecha);
          return fechaAUsar >= fechaHoy;
        });
        const ventasHoyExternas = externas.filter((v) => {
          const fechaAUsar = v.fecha2 || this.convertirFechaAlFormato(v.fecha);
          return fechaAUsar >= fechaHoy;
        });

        // Calcular ingresos
        const totalIngresosInternos = internas.reduce((sum: number, v: DistribuidorVenta) => {
          try {
            const ventaTotal = v.productos.reduce((prodSum: number, prod: DistribuidorProducto) => {
              // Usar subtotal si existe, sino calcular cantidad * precio
              const subtotal = prod.subtotal
                ? parseFloat(prod.subtotal)
                : parseFloat(prod.cantidad || '0') * parseFloat(prod.precio || '0');
              return prodSum + (isNaN(subtotal) ? 0 : subtotal);
            }, 0);
            return sum + ventaTotal;
          } catch {
            return sum;
          }
        }, 0);

        const totalIngresosExternos = externas.reduce((sum: number, v: DistribuidorVenta) => {
          try {
            const ventaTotal = v.productos.reduce((prodSum: number, prod: DistribuidorProducto) => {
              // Usar subtotal si existe, sino calcular cantidad * precio
              const subtotal = prod.subtotal
                ? parseFloat(prod.subtotal)
                : parseFloat(prod.cantidad || '0') * parseFloat(prod.precio || '0');
              return prodSum + (isNaN(subtotal) ? 0 : subtotal);
            }, 0);
            return sum + ventaTotal;
          } catch {
            return sum;
          }
        }, 0);

        const result = {
          totalDistribuidoresInternos: rolesInternos.size,
          totalDistribuidoresExternos: rolesExternos.size,
          totalVentasInternas: internas.length,
          totalVentasExternas: externas.length,
          ventasHoyInternas: ventasHoyInternas.length,
          ventasHoyExternas: ventasHoyExternas.length,
          totalIngresosInternos,
          totalIngresosExternos,
        };

        return result;
      }),
      catchError((error) => {
        console.error('Error obteniendo estadísticas:', error);
        return of(this.getEstadisticasVacias());
      })
    );
  }

  private getEstadisticasVacias(): DistribuidorEstadisticas {
    return {
      totalDistribuidoresInternos: 0,
      totalDistribuidoresExternos: 0,
      totalVentasInternas: 0,
      totalVentasExternas: 0,
      ventasHoyInternas: 0,
      ventasHoyExternas: 0,
      totalIngresosInternos: 0,
      totalIngresosExternos: 0,
    };
  }

  // Generar número de factura único
  async generarNumeroFactura(tipo: 'interno' | 'externo' = 'interno'): Promise<string> {
    const fecha = new Date();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');

    const prefijo = tipo === 'interno' ? 'DI' : 'DE'; // DI = Distribuidor Interno, DE = Distribuidor Externo

    // Obtener el último número de factura del día para el tipo correspondiente
    const ventasHoy = await this.getVentasHoy(tipo);
    const ultimoNumero = ventasHoy.length + 1;

    return `${prefijo}${year}${month}${day}${String(ultimoNumero).padStart(3, '0')}`;
  }

  private async getVentasHoy(tipo: 'interno' | 'externo'): Promise<DistribuidorVenta[]> {
    const collection =
      tipo === 'interno' ? this.ventasInternasCollection : this.ventasExternasCollection;
    if (!collection) return [];

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${year}-${month}-${day}`;

    // Para mañana (fin del día de hoy)
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const yearManana = manana.getFullYear();
    const monthManana = String(manana.getMonth() + 1).padStart(2, '0');
    const dayManana = String(manana.getDate()).padStart(2, '0');
    const fechaManana = `${yearManana}-${monthManana}-${dayManana}`;

    const q = query(
      collection,
      where('eliminado', '==', false),
      where('fecha2', '>=', fechaHoy),
      where('fecha2', '<', fechaManana)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as DistribuidorVenta));
  }

  // Obtener roles disponibles
  getRolesInternosDisponibles(): string[] {
    return ['seller1', 'seller2', 'seller3', 'seller4'];
  }

  // Generar nuevo role para distribuidor externo
  async generarRoleExterno(): Promise<string> {
    try {
      const ventasExternas = await firstValueFrom(
        this.getVentasExternas().pipe(catchError(() => of([])))
      );
      const rolesExistentes = ventasExternas
        .map((v) => v.role)
        .filter((role) => role?.startsWith('clientSeller'))
        .map((role) => parseInt(role!.replace('clientSeller', '')))
        .filter((num) => !isNaN(num));

      const maxNumero = rolesExistentes.length > 0 ? Math.max(...rolesExistentes) : 0;
      return `clientSeller${maxNumero + 1}`;
    } catch (error) {
      console.error('Error generando role externo:', error);
      return 'clientSeller1';
    }
  }
}
