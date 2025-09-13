import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, combineLatest, map, of, tap } from 'rxjs';
import {
  Distribuidor,
  DistribuidorEstadisticas,
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
    return collection(this.firestore, `usuarios/${this.userId}/ventas`);
  }

  private get distribuidoresCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/roleData`);
  }

  // Ventas de distribuidores del día actual (OPTIMIZADO)
  getVentasDistribuidoresHoy(): Observable<DistribuidorVenta[]> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${year}-${month}-${day}`;

    console.log('🔍 Buscando ventas para fecha:', fechaHoy);

    // Para mañana (fin del día de hoy)
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const yearManana = manana.getFullYear();
    const monthManana = String(manana.getMonth() + 1).padStart(2, '0');
    const dayManana = String(manana.getDate()).padStart(2, '0');
    const fechaManana = `${yearManana}-${monthManana}-${dayManana}`;

    console.log('📅 Rango de fechas:', { fechaHoy, fechaManana });

    const q = query(
      this.ventasInternasCollection,
      where('eliminado', '==', false),
      where('fecha2', '>=', fechaHoy),
      where('fecha2', '<', fechaManana)
      // Removido: where('role', '!=', '') - filtraremos después
    );

    return collectionData(q, { idField: 'factura' }).pipe(
      map((docs) => docs as DistribuidorVenta[]),
      tap((ventas: DistribuidorVenta[]) => {
        console.log('📊 Ventas encontradas en Firestore:', ventas.length);
        ventas.forEach((venta: DistribuidorVenta, index: number) => {
          console.log(`Venta ${index + 1}:`, {
            factura: venta.factura,
            fecha2: venta.fecha2,
            role: venta.role,
            total: venta.total,
          });
        });
      }),
      map((ventas: DistribuidorVenta[]) =>
        ventas.filter((venta: DistribuidorVenta) => {
          const hasRole = venta.role && venta.role.trim() !== '';
          const fechaValida =
            venta.fecha2 && venta.fecha2 >= fechaHoy && venta.fecha2 < fechaManana;

          console.log('🔍 Filtrando venta:', {
            factura: venta.factura,
            fecha2: venta.fecha2,
            role: venta.role,
            hasRole,
            fechaValida,
          });

          return hasRole && fechaValida;
        })
      ),
      tap((ventasFiltradas: DistribuidorVenta[]) => {
        console.log('✅ Ventas después del filtro:', ventasFiltradas.length);
      })
    );
  }

  // Ventas de distribuidores del día actual (VERSIÓN SIMPLIFICADA - FALLBACK)
  getVentasDistribuidoresHoySimple(): Observable<DistribuidorVenta[]> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${year}-${month}-${day}`;

    console.log('🔍 [SIMPLE] Buscando ventas para fecha:', fechaHoy);

    // OBTENER TODAS LAS VENTAS NO ELIMINADAS (sin filtro de fecha en Firestore)
    const q = query(this.ventasInternasCollection, where('eliminado', '==', false));

    return collectionData(q, { idField: 'factura' }).pipe(
      map((docs) => docs as DistribuidorVenta[]),
      tap((ventas: DistribuidorVenta[]) => {
        console.log('📊 [SIMPLE] Total ventas en Firestore:', ventas.length);
      }),
      map((ventas: DistribuidorVenta[]) =>
        ventas.filter((venta: DistribuidorVenta) => {
          // FILTRAR POR FECHA Y ROLE EN EL CLIENTE
          const fechaVenta = venta.fecha2;
          const fechaValida = fechaVenta === fechaHoy;
          const hasRole = venta.role && venta.role.trim() !== '';

          console.log('🔍 [SIMPLE] Filtrando venta:', {
            factura: venta.factura,
            fecha2: venta.fecha2,
            fechaEsperada: fechaHoy,
            role: venta.role,
            fechaValida,
            hasRole,
          });

          return fechaValida && hasRole;
        })
      ),
      tap((ventasFiltradas: DistribuidorVenta[]) => {
        console.log('✅ [SIMPLE] Ventas del día encontradas:', ventasFiltradas.length);
        ventasFiltradas.forEach((venta, index) => {
          console.log(`   Venta ${index + 1}: ${venta.factura} - ${venta.total} - ${venta.role}`);
        });
        // Crear distribuidores automáticamente para roles nuevos
        this.createDistributorsFromSales(ventasFiltradas);
      })
    );
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

  // === DISTRIBUIDORES ===

  // Obtener todos los distribuidores
  getDistribuidores(): Observable<Distribuidor[]> {
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');
    return collectionData(this.distribuidoresCollection, { idField: 'role' }) as Observable<
      Distribuidor[]
    >;
  }

  // Obtener distribuidor específico por role
  async getDistribuidorByRole(role: string): Promise<Distribuidor | null> {
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');

    try {
      const docRef = doc(this.distribuidoresCollection, role);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return {
          role: docSnap.id,
          ...docSnap.data(),
        } as Distribuidor;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error obteniendo distribuidor por role:', error);
      throw error;
    }
  }

  // Agregar nuevo distribuidor
  async addDistribuidor(distribuidor: any): Promise<void> {
    if (!this.distribuidoresCollection) {
      throw new Error('Usuario no autenticado');
    }

    // Verificar que el rol no esté duplicado
    const roleExists = await this.checkRoleExists(distribuidor.role);
    if (roleExists) {
      throw new Error(`El rol "${distribuidor.role}" ya está asignado a otro distribuidor`);
    }

    const nuevoDistribuidor: any = {
      ...distribuidor,
      fechaRegistro: new Date().toISOString().split('T')[0],
    };

    const docRef = doc(this.distribuidoresCollection, nuevoDistribuidor.role);
    await setDoc(docRef, nuevoDistribuidor);
  }

  // Verificar si un rol ya existe
  async checkRoleExists(role: string): Promise<boolean> {
    if (!this.distribuidoresCollection) return false;

    try {
      const docRef = doc(this.distribuidoresCollection, role);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.error('Error verificando rol:', error);
      return false;
    }
  }

  // Crear distribuidores automáticamente desde ventas (para roles que no existen)
  private async createDistributorsFromSales(ventas: DistribuidorVenta[]): Promise<void> {
    if (!ventas || ventas.length === 0) return;

    // Obtener roles únicos de las ventas, excluyendo seller1
    const rolesUnicos = new Set(
      ventas.map((v) => v.role).filter((role) => role && role !== 'seller1')
    );

    // Para cada role, verificar si existe y crearlo si no
    for (const role of rolesUnicos) {
      const exists = await this.checkRoleExists(role);
      if (!exists) {
        try {
          // Determinar tipo basado en el prefijo del role
          const tipo = role.startsWith('seller') ? 'interno' : 'externo';
          const nombre =
            tipo === 'interno'
              ? `Distribuidor Interno ${role.replace('seller', '')}`
              : `Distribuidor Externo ${role.replace('clientSeller', '')}`;

          const nuevoDistribuidor = {
            nombre,
            tipo,
            role,
            estado: 'activo' as const,
            fechaRegistro: new Date().toISOString().split('T')[0],
          };

          const docRef = doc(this.distribuidoresCollection!, role);
          await setDoc(docRef, nuevoDistribuidor);
          console.log(`✅ Distribuidor ${role} creado automáticamente desde ventas`);
        } catch (error) {
          console.error(`❌ Error creando distribuidor ${role} desde ventas:`, error);
        }
      }
    }
  }

  // Crear distribuidores internos por defecto (seller1, seller2, seller3, seller4) si no existen
  async createDefaultSellersIfNotExist(): Promise<void> {
    if (!this.distribuidoresCollection) return;

    const defaultSellers = [
      { nombre: 'Distribuidor Interno 1', role: 'seller1' },
      { nombre: 'Distribuidor Interno 2', role: 'seller2' },
      { nombre: 'Distribuidor Interno 3', role: 'seller3' },
      { nombre: 'Distribuidor Interno 4', role: 'seller4' },
    ];

    for (const seller of defaultSellers) {
      const roleExists = await this.checkRoleExists(seller.role);
      if (!roleExists) {
        try {
          const defaultSeller = {
            nombre: seller.nombre,
            tipo: 'interno' as const,
            role: seller.role,
            estado: 'activo' as const,
            fechaRegistro: new Date().toISOString().split('T')[0],
          };

          const docRef = doc(this.distribuidoresCollection, seller.role);
          await setDoc(docRef, defaultSeller);
          console.log(`✅ Distribuidor ${seller.role} creado automáticamente`);
        } catch (error) {
          console.error(`❌ Error creando distribuidor ${seller.role}:`, error);
        }
      }
    }
  }

  // Actualizar distribuidor
  async updateDistribuidor(distribuidor: Distribuidor): Promise<void> {
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');

    // Validar que el role no esté vacío
    if (!distribuidor.role || distribuidor.role.trim() === '') {
      throw new Error('El rol del distribuidor no puede estar vacío');
    }

    const docRef = doc(this.distribuidoresCollection, distribuidor.role);
    await updateDoc(docRef, {
      ...distribuidor,
      ultima_modificacion: serverTimestamp(),
    });
  }

  // Eliminar distribuidor (marcar como inactivo)
  async deleteDistribuidor(role: string): Promise<void> {
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');
    const docRef = doc(this.distribuidoresCollection, role);
    await updateDoc(docRef, {
      estado: 'inactivo',
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

  // Estadísticas diarias optimizadas (solo datos del día actual)
  getEstadisticasDiarias(): Observable<DistribuidorEstadisticas> {
    if (!this.userId) {
      return of(this.getEstadisticasVacias());
    }

    // USAR MÉTODO SIMPLIFICADO PARA MEJOR COMPATIBILIDAD
    return combineLatest([
      this.getDistribuidores().pipe(catchError(() => of([]))),
      this.getVentasDistribuidoresHoySimple().pipe(catchError(() => of([]))),
    ]).pipe(
      map(([distribuidores, ventasHoy]) => {
        console.log('📊 Estadísticas calculadas:', {
          distribuidores: distribuidores.length,
          ventasHoy: ventasHoy.length,
        });

        // Contar distribuidores reales por tipo y estado activo
        const distribuidoresInternos = distribuidores.filter(
          (d: any) => d.tipo === 'interno' && d.estado === 'activo'
        );
        const distribuidoresExternos = distribuidores.filter(
          (d: any) => d.tipo === 'externo' && d.estado === 'activo'
        );

        // Separar ventas de hoy por tipo
        const ventasHoyInternas = ventasHoy.filter((venta: DistribuidorVenta) =>
          venta.role?.startsWith('seller')
        );
        const ventasHoyExternas = ventasHoy.filter((venta: DistribuidorVenta) =>
          venta.role?.startsWith('clientSeller')
        );

        // Calcular ingresos de hoy
        const ingresosHoyInternos = ventasHoyInternas.reduce(
          (sum: number, v: DistribuidorVenta) => {
            const total = v.total ? parseFloat(v.total.toString()) : 0;
            return sum + total;
          },
          0
        );

        const ingresosHoyExternos = ventasHoyExternas.reduce(
          (sum: number, v: DistribuidorVenta) => {
            const total = v.total ? parseFloat(v.total.toString()) : 0;
            return sum + total;
          },
          0
        );

        const resultado = {
          totalDistribuidoresInternos: distribuidoresInternos.length,
          totalDistribuidoresExternos: distribuidoresExternos.length,
          totalVentasInternas: 0, // No necesitamos totales históricos
          totalVentasExternas: 0, // No necesitamos totales históricos
          ventasHoyInternas: ventasHoyInternas.length,
          ventasHoyExternas: ventasHoyExternas.length,
          totalIngresosInternos: ingresosHoyInternos, // Ingresos de hoy
          totalIngresosExternos: ingresosHoyExternos, // Ingresos de hoy
        };

        console.log('📈 Resultado final:', resultado);
        return resultado;
      }),
      catchError((error) => {
        console.error('❌ Error obteniendo estadísticas diarias:', error);
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
    if (!this.ventasInternasCollection) return [];

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
      this.ventasInternasCollection,
      where('eliminado', '==', false),
      where('fecha2', '>=', fechaHoy),
      where('fecha2', '<', fechaManana)
    );

    const snapshot = await getDocs(q);
    const ventas = snapshot.docs.map(
      (doc) => ({ role: doc.id, ...doc.data() } as DistribuidorVenta)
    );

    // Filtrar por tipo de distribuidor basado en el role
    const rolePrefix = tipo === 'interno' ? 'seller' : 'clientSeller';
    return ventas.filter(
      (venta) => venta.role?.startsWith(rolePrefix) && venta.role && venta.role.trim() !== ''
    );
  }

  // Obtener ventas de un distribuidor específico por role
  async getVentasByDistribuidorRole(role: string): Promise<DistribuidorVenta[]> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');

    try {
      const q = query(
        this.ventasInternasCollection,
        where('eliminado', '==', false),
        where('role', '==', role)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(
        (doc) =>
          ({
            role: doc.id,
            ...doc.data(),
          } as DistribuidorVenta)
      );
    } catch (error) {
      console.error('Error obteniendo ventas por role:', error);
      return [];
    }
  }

  // Obtener productos disponibles (por ahora devuelve productos de ejemplo)
  async getProductosDisponibles(): Promise<any[]> {
    // TODO: Implementar carga real desde Firestore
    // Por ahora, devolver productos de ejemplo
    return [
      { id: 1, name: 'Producto A', precio: 10.5 },
      { id: 2, name: 'Producto B', precio: 15 },
      { id: 3, name: 'Producto C', precio: 8.25 },
      { id: 4, name: 'Producto D', precio: 12 },
    ];
  }
}
