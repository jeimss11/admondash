import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  Observable,
  catchError,
  combineLatest,
  firstValueFrom,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import {
  Distribuidor,
  DistribuidorEstadisticas,
  DistribuidorVenta,
  EstadisticasOperacion,
  FacturaPendiente,
  GastoOperativo,
  // Nuevos modelos para gestión diaria completa
  OperacionDiaria,
  ProductoCargado,
  ProductoNoRetornado,
  ProductoRetornado,
  ResumenDiario,
} from '../models/distributor.models';

@Injectable({ providedIn: 'root' })
export class DistributorsService {
  constructor(private firestore: Firestore, private auth: Auth) {}

  private get userId(): string | undefined {
    const uid = this.auth.currentUser?.uid;
    console.log('🔍 UserId obtenido:', uid);
    if (!uid) {
      console.warn('⚠️ Usuario no autenticado - currentUser es null');
    }
    return uid;
  }

  /**
   * Verifica el estado de autenticación del usuario
   */
  verificarEstadoAutenticacion(): { autenticado: boolean; userId?: string; error?: string } {
    try {
      const userId = this.userId;
      if (userId) {
        console.log('✅ Usuario autenticado:', userId);
        return { autenticado: true, userId };
      } else {
        console.warn('⚠️ Usuario no autenticado');
        return { autenticado: false, error: 'Usuario no autenticado' };
      }
    } catch (error) {
      console.error('❌ Error verificando autenticación:', error);
      return { autenticado: false, error: String(error) };
    }
  }

  /**
   * Método de diagnóstico para verificar la sincronización
   */
  async diagnosticarSincronizacion(distribuidorId: string): Promise<{
    autenticacion: any;
    operacionesActivas: number;
    ultimaOperacion?: OperacionDiaria;
    error?: string;
  }> {
    try {
      const autenticacion = this.verificarEstadoAutenticacion();

      if (!autenticacion.autenticado) {
        return {
          autenticacion,
          operacionesActivas: 0,
          error: 'Usuario no autenticado',
        };
      }

      const operaciones = await firstValueFrom(
        this.getOperacionesPorDistribuidorRealtime(
          distribuidorId,
          this.getFechaHace30Dias(),
          this.getTodayDate()
        )
      );

      if (!operaciones) {
        return {
          autenticacion,
          operacionesActivas: 0,
          error: 'No se pudieron obtener las operaciones',
        };
      }

      const operacionesActivas = operaciones.filter(
        (op: OperacionDiaria) => op.estado === 'activa'
      );
      const ultimaOperacion = operacionesActivas.length > 0 ? operacionesActivas[0] : undefined;

      return {
        autenticacion,
        operacionesActivas: operacionesActivas.length,
        ultimaOperacion,
      };
    } catch (error) {
      console.error('❌ Error en diagnóstico de sincronización:', error);
      return {
        autenticacion: this.verificarEstadoAutenticacion(),
        operacionesActivas: 0,
        error: String(error),
      };
    }
  }

  /**
   * Método auxiliar para obtener fecha de hace 30 días
   */
  private getFechaHace30Dias(): string {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 30);
    return fecha.toISOString().split('T')[0];
  }

  /**
   * Método auxiliar para obtener fecha de hoy
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
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

  // Marcar una venta como pagada
  async markVentaAsPaid(factura: string): Promise<void> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');

    try {
      // Intentar actualizar en ventas internas primero
      const docRefInterna = await this.findDocByFactura(this.ventasInternasCollection, factura);
      await updateDoc(docRefInterna, {
        pagado: true,
        ultima_modificacion: serverTimestamp(),
      });
      console.log(`✅ Venta interna ${factura} marcada como pagada`);
    } catch (errorInterna) {
      try {
        // Si no se encontró en internas, intentar en externas
        if (!this.ventasExternasCollection) throw new Error('Usuario no autenticado');
        const docRefExterna = await this.findDocByFactura(this.ventasExternasCollection, factura);
        await updateDoc(docRefExterna, {
          pagado: true,
          ultima_modificacion: serverTimestamp(),
        });
        console.log(`✅ Venta externa ${factura} marcada como pagada`);
      } catch (errorExterna) {
        console.error('❌ Error marcando venta como pagada:', {
          factura,
          errorInterna: errorInterna instanceof Error ? errorInterna.message : String(errorInterna),
          errorExterna: errorExterna instanceof Error ? errorExterna.message : String(errorExterna),
        });
        throw new Error(`No se pudo marcar la venta ${factura} como pagada`);
      }
    }
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

  // Obtener ventas de un distribuidor específico por role (TIEMPO REAL)
  getVentasByDistribuidorRoleRealtime(role: string): Observable<DistribuidorVenta[]> {
    if (!this.ventasInternasCollection) throw new Error('Usuario no autenticado');

    const q = query(
      this.ventasInternasCollection,
      where('eliminado', '==', false),
      where('role', '==', role)
    );

    return collectionData(q, { idField: 'factura' }).pipe(
      map((docs) => docs as DistribuidorVenta[]),
      tap((ventas: DistribuidorVenta[]) => {
        console.log(`🔄 [REALTIME] Ventas actualizadas para ${role}:`, ventas.length);
      }),
      catchError((error) => {
        console.error('❌ Error en listener realtime:', error);
        return of([]);
      })
    );
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

  // === MÉTODOS PARA GESTIÓN DE DÍA ===

  // Obtener estado del día actual para un distribuidor
  async getEstadoDia(distribuidorId: string, fecha: string): Promise<any> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const diaRef = doc(this.firestore, `usuarios/${this.userId}/dias/${distribuidorId}_${fecha}`);
      const diaSnap = await getDoc(diaRef);

      if (diaSnap.exists()) {
        return diaSnap.data();
      }

      return null;
    } catch (error) {
      console.error('❌ Error obteniendo estado del día:', error);
      return null;
    }
  }

  // Obtener historial de días para un distribuidor
  async getHistorialDias(distribuidorId: string, dias: number = 30): Promise<any[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const diasCollection = collection(this.firestore, `usuarios/${this.userId}/dias`);
      const q = query(diasCollection, where('distribuidorId', '==', distribuidorId));
      const querySnapshot = await getDocs(q);

      const historial: any[] = [];
      querySnapshot.forEach((doc) => {
        historial.push({ id: doc.id, ...doc.data() });
      });

      // Ordenar por fecha descendente y limitar
      return historial
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
        .slice(0, dias);
    } catch (error) {
      console.error('❌ Error obteniendo historial de días:', error);
      return [];
    }
  }

  // Abrir día para un distribuidor
  async abrirDia(apertura: any): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const diaId = `${apertura.distribuidorId}_${apertura.fecha}`;
      const diaRef = doc(this.firestore, `usuarios/${this.userId}/dias/${diaId}`);

      await setDoc(diaRef, {
        ...apertura,
        fechaCreacion: serverTimestamp(),
      });

      console.log('✅ Día abierto correctamente:', diaId);
    } catch (error) {
      console.error('❌ Error abriendo día:', error);
      throw error;
    }
  }

  // Cerrar día para un distribuidor
  async cerrarDia(cierre: any): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const diaId = `${cierre.distribuidorId}_${cierre.fecha}`;
      const diaRef = doc(this.firestore, `usuarios/${this.userId}/dias/${diaId}`);

      await updateDoc(diaRef, {
        ...cierre,
        fechaCreacion: serverTimestamp(),
      });

      console.log('✅ Día cerrado correctamente:', diaId);
    } catch (error) {
      console.error('❌ Error cerrando día:', error);
      throw error;
    }
  }

  // Calcular estadísticas del día para un distribuidor
  async calcularEstadisticasDia(distribuidorId: string, fecha: string): Promise<any> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      // Obtener ventas del día
      const ventas = await this.getVentasByDistribuidorRoleAndDate(distribuidorId, fecha);

      let ventasTotales = 0;
      let productosVendidos: any[] = [];
      let dineroInicial = 0;

      // Calcular estadísticas de ventas
      ventas.forEach((venta: any) => {
        ventasTotales += parseFloat(venta.total?.toString() || '0');

        if (venta.productos && Array.isArray(venta.productos)) {
          productosVendidos.push(...venta.productos);
        }
      });

      // Obtener dinero inicial del día si existe
      const estadoDia = await this.getEstadoDia(distribuidorId, fecha);
      if (estadoDia?.apertura?.montoInicial) {
        dineroInicial = estadoDia.apertura.montoInicial;
      }

      return {
        distribuidorId,
        fecha,
        ventasTotales,
        productosVendidos,
        dineroInicial,
        dineroFinal: 0, // Se calculará al cerrar el día
        diferencia: 0, // Se calculará al cerrar el día
        productosDefectuosos: 0,
        productosCaducados: 0,
        ajustesTotales: 0,
        estado: 'normal',
      };
    } catch (error) {
      console.error('❌ Error calculando estadísticas del día:', error);
      return {
        distribuidorId,
        fecha,
        ventasTotales: 0,
        productosVendidos: [],
        dineroInicial: 0,
        dineroFinal: 0,
        diferencia: 0,
        productosDefectuosos: 0,
        productosCaducados: 0,
        ajustesTotales: 0,
        estado: 'error',
      };
    }
  }

  // Método auxiliar para obtener ventas por distribuidor y fecha
  private async getVentasByDistribuidorRoleAndDate(
    distribuidorId: string,
    fecha: string
  ): Promise<any[]> {
    if (!this.userId) return [];

    try {
      const ventasCollection = collection(this.firestore, `usuarios/${this.userId}/ventas`);
      const q = query(
        ventasCollection,
        where('role', '==', distribuidorId),
        where('fecha2', '==', fecha)
      );

      const querySnapshot = await getDocs(q);
      const ventas: any[] = [];

      querySnapshot.forEach((doc) => {
        ventas.push({ id: doc.id, ...doc.data() });
      });

      return ventas;
    } catch (error) {
      console.error('❌ Error obteniendo ventas por fecha:', error);
      return [];
    }
  }

  // ===========================================
  // 🆕 NUEVOS MÉTODOS PARA GESTIÓN DIARIA COMPLETA
  // ===========================================

  // === GESTIÓN DE OPERACIONES DIARIAS ===

  /**
   * Crear una nueva operación diaria
   */
  async crearOperacionDiaria(
    operacion: Omit<OperacionDiaria, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const operacionId = `${operacion.distribuidorId}_${operacion.fecha}`;
      const operacionRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}`
      );

      const nuevaOperacion: OperacionDiaria = {
        ...operacion,
        id: operacionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(operacionRef, nuevaOperacion);
      console.log('✅ Operación diaria creada:', operacionId);
      return operacionId;
    } catch (error) {
      console.error('❌ Error creando operación diaria:', error);
      throw error;
    }
  }

  /**
   * Obtener operación diaria por ID
   */
  async getOperacionDiaria(operacionId: string): Promise<OperacionDiaria | null> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const operacionRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}`
      );
      const operacionSnap = await getDoc(operacionRef);

      if (operacionSnap.exists()) {
        return { id: operacionSnap.id, ...operacionSnap.data() } as OperacionDiaria;
      }
      return null;
    } catch (error) {
      console.error('❌ Error obteniendo operación diaria:', error);
      throw error;
    }
  }

  /**
   * Obtener operación activa de un distribuidor
   */
  async getOperacionActiva(distribuidorId: string): Promise<OperacionDiaria | null> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);
      const q = query(
        operacionesRef,
        where('distribuidorId', '==', distribuidorId),
        where('estado', '==', 'activa')
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() } as OperacionDiaria;
      }
      return null;
    } catch (error) {
      console.error('❌ Error obteniendo operación activa:', error);
      throw error;
    }
  }

  /**
   * Cerrar operación diaria
   */
  async cerrarOperacionDiaria(operacionId: string, resumen: ResumenDiario): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const operacionRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}`
      );
      const resumenRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/resumen_diario/resumen`
      );

      await updateDoc(operacionRef, {
        estado: 'cerrada',
        cerradoPor: resumen.cerradoPor,
        fechaCierre: resumen.fechaCierre,
        updatedAt: new Date().toISOString(),
      });

      await setDoc(resumenRef, resumen);
      console.log('✅ Operación diaria cerrada:', operacionId);
    } catch (error) {
      console.error('❌ Error cerrando operación diaria:', error);
      throw error;
    }
  }

  // === GESTIÓN DE PRODUCTOS CARGADOS ===

  /**
   * Agregar producto cargado a la operación
   */
  async agregarProductoCargado(
    operacionId: string,
    producto: Omit<ProductoCargado, 'id' | 'operacionId'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productoId = `${producto.productoId}_${Date.now()}`;
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_cargados/${productoId}`
      );

      const nuevoProducto: ProductoCargado = {
        ...producto,
        id: productoId,
        operacionId,
      };

      await setDoc(productoRef, nuevoProducto);
      console.log('✅ Producto cargado agregado:', productoId);
      return productoId;
    } catch (error) {
      console.error('❌ Error agregando producto cargado:', error);
      throw error;
    }
  }

  /**
   * Obtener productos cargados de una operación
   */
  async getProductosCargados(operacionId: string): Promise<ProductoCargado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productosRef = collection(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_cargados`
      );
      const querySnapshot = await getDocs(productosRef);

      const productos: ProductoCargado[] = [];
      querySnapshot.forEach((doc) => {
        productos.push({ id: doc.id, ...doc.data() } as ProductoCargado);
      });

      return productos;
    } catch (error) {
      console.error('❌ Error obteniendo productos cargados:', error);
      throw error;
    }
  }

  // === GESTIÓN DE PRODUCTOS NO RETORNADOS ===

  /**
   * Registrar producto no retornado
   */
  async registrarProductoNoRetornado(
    operacionId: string,
    producto: Omit<ProductoNoRetornado, 'id' | 'operacionId'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const itemId = `no_retornado_${Date.now()}`;
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_no_retornados/${itemId}`
      );

      const nuevoProducto: ProductoNoRetornado = {
        ...producto,
        id: itemId,
        operacionId,
      };

      await setDoc(productoRef, nuevoProducto);
      console.log('✅ Producto no retornado registrado:', itemId);
      return itemId;
    } catch (error) {
      console.error('❌ Error registrando producto no retornado:', error);
      throw error;
    }
  }

  /**
   * Obtener productos no retornados de una operación
   */
  async getProductosNoRetornados(operacionId: string): Promise<ProductoNoRetornado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productosRef = collection(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_no_retornados`
      );
      const querySnapshot = await getDocs(productosRef);

      const productos: ProductoNoRetornado[] = [];
      querySnapshot.forEach((doc) => {
        productos.push({ id: doc.id, ...doc.data() } as ProductoNoRetornado);
      });

      return productos;
    } catch (error) {
      console.error('❌ Error obteniendo productos no retornados:', error);
      throw error;
    }
  }

  // === GESTIÓN DE PRODUCTOS RETORNADOS ===

  /**
   * Registrar producto retornado
   */
  async registrarProductoRetornado(
    operacionId: string,
    producto: Omit<ProductoRetornado, 'id' | 'operacionId'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const itemId = `retornado_${Date.now()}`;
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_retornados/${itemId}`
      );

      const nuevoProducto: ProductoRetornado = {
        ...producto,
        id: itemId,
        operacionId,
      };

      await setDoc(productoRef, nuevoProducto);
      console.log('✅ Producto retornado registrado:', itemId);
      return itemId;
    } catch (error) {
      console.error('❌ Error registrando producto retornado:', error);
      throw error;
    }
  }

  /**
   * Obtener productos retornados de una operación
   */
  async getProductosRetornados(operacionId: string): Promise<ProductoRetornado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productosRef = collection(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_retornados`
      );
      const querySnapshot = await getDocs(productosRef);

      const productos: ProductoRetornado[] = [];
      querySnapshot.forEach((doc) => {
        productos.push({ id: doc.id, ...doc.data() } as ProductoRetornado);
      });

      return productos;
    } catch (error) {
      console.error('❌ Error obteniendo productos retornados:', error);
      throw error;
    }
  }

  // === GESTIÓN DE GASTOS OPERATIVOS ===

  /**
   * Registrar gasto operativo
   */
  async registrarGastoOperativo(
    operacionId: string,
    gasto: Omit<GastoOperativo, 'id' | 'operacionId'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const gastoId = `gasto_${Date.now()}`;
      const gastoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/gastos/${gastoId}`
      );

      const nuevoGasto: GastoOperativo = {
        ...gasto,
        id: gastoId,
        operacionId,
      };

      await setDoc(gastoRef, nuevoGasto);
      console.log('✅ Gasto operativo registrado:', gastoId);
      return gastoId;
    } catch (error) {
      console.error('❌ Error registrando gasto operativo:', error);
      throw error;
    }
  }

  /**
   * Obtener gastos operativos de una operación
   */
  async getGastosOperativos(operacionId: string): Promise<GastoOperativo[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const gastosRef = collection(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/gastos`
      );
      const querySnapshot = await getDocs(gastosRef);

      const gastos: GastoOperativo[] = [];
      querySnapshot.forEach((doc) => {
        gastos.push({ id: doc.id, ...doc.data() } as GastoOperativo);
      });

      return gastos;
    } catch (error) {
      console.error('❌ Error obteniendo gastos operativos:', error);
      throw error;
    }
  }

  // === GESTIÓN DE FACTURAS PENDIENTES ===

  /**
   * Crear factura pendiente
   */
  async crearFacturaPendiente(
    operacionId: string,
    factura: Omit<FacturaPendiente, 'id' | 'operacionId'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const facturaId = `factura_${Date.now()}`;
      const facturaRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/facturas_pendientes/${facturaId}`
      );

      const nuevaFactura: FacturaPendiente = {
        ...factura,
        id: facturaId,
        operacionId,
      };

      await setDoc(facturaRef, nuevaFactura);
      console.log('✅ Factura pendiente creada:', facturaId);
      return facturaId;
    } catch (error) {
      console.error('❌ Error creando factura pendiente:', error);
      throw error;
    }
  }

  /**
   * Obtener facturas pendientes de una operación
   */
  async getFacturasPendientes(operacionId: string): Promise<FacturaPendiente[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const facturasRef = collection(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/facturas_pendientes`
      );
      const querySnapshot = await getDocs(facturasRef);

      const facturas: FacturaPendiente[] = [];
      querySnapshot.forEach((doc) => {
        facturas.push({ id: doc.id, ...doc.data() } as FacturaPendiente);
      });

      return facturas;
    } catch (error) {
      console.error('❌ Error obteniendo facturas pendientes:', error);
      throw error;
    }
  }

  /**
   * Actualizar estado de factura pendiente
   */
  async actualizarFacturaPendiente(
    operacionId: string,
    facturaId: string,
    updates: Partial<FacturaPendiente>
  ): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const facturaRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/facturas_pendientes/${facturaId}`
      );
      await updateDoc(facturaRef, updates);
      console.log('✅ Factura pendiente actualizada:', facturaId);

      // Si se cambió el estado, recalcular estadísticas de la operación
      if (updates.estado) {
        console.log('🔄 Estado de factura cambiado, recalculando estadísticas...');
        await this.calcularEstadisticasOperacion(operacionId);
      }
    } catch (error) {
      console.error('❌ Error actualizando factura pendiente:', error);
      throw error;
    }
  }

  // === UTILIDADES Y ESTADÍSTICAS ===

  /**
   * Calcular estadísticas de una operación
   */
  async calcularEstadisticasOperacion(operacionId: string): Promise<EstadisticasOperacion> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const operacion = await this.getOperacionDiaria(operacionId);
      if (!operacion) throw new Error('Operación no encontrada');

      // Obtener todos los datos de la operación
      const [
        productosCargados,
        productosRetornados,
        productosNoRetornados,
        gastos,
        facturas,
        resumen,
      ] = await Promise.all([
        this.getProductosCargados(operacionId),
        this.getProductosRetornados(operacionId),
        this.getProductosNoRetornados(operacionId),
        this.getGastosOperativos(operacionId),
        this.getFacturasPendientes(operacionId),
        this.getResumenDiario(operacionId),
      ]);

      // Calcular estadísticas
      const totalProductosCargados = productosCargados.reduce((sum, p) => sum + p.total, 0);
      const totalProductosRetornados = productosRetornados.reduce(
        (sum, p) => sum + (p.totalValor || 0),
        0
      );
      const totalProductosNoRetornados = productosNoRetornados.reduce(
        (sum, p) => sum + p.totalPerdida,
        0
      );
      const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
      const totalPerdidas = productosNoRetornados.reduce((sum, p) => sum + p.totalPerdida, 0);

      // Calcular total de facturas pagas
      const totalFacturasPagas = facturas
        .filter((factura) => factura.estado === 'pagada')
        .reduce((total, factura) => total + (factura.monto || 0), 0);

      const estadisticas: EstadisticasOperacion = {
        operacionId,
        distribuidorId: operacion.distribuidorId,
        fecha: operacion.fecha,
        rendimiento: {
          porcentajeProductosRetornados:
            totalProductosCargados > 0
              ? (totalProductosRetornados / totalProductosCargados) * 100
              : 0,
          porcentajeProductosUtilizados:
            totalProductosCargados > 0
              ? (totalProductosNoRetornados / totalProductosCargados) * 100
              : 0,
          eficienciaFinanciera: resumen
            ? (resumen.dineroEsperado / resumen.dineroEntregado) * 100
            : 0,
        },
        resumen: {
          ingresos: resumen?.totalVentas || 0,
          egresos: totalGastos,
          perdidas: totalPerdidas,
          gananciaNeta: (resumen?.totalVentas || 0) - totalGastos - totalPerdidas,
        },
        alertas: {
          diferenciaDinero: resumen ? Math.abs(resumen.diferencia) > 1000 : false,
          productosPerdidos: totalProductosNoRetornados > 0,
          facturasVencidas: facturas.some((f) => f.estado === 'vencida'),
        },
      };

      return estadisticas;
    } catch (error) {
      console.error('❌ Error calculando estadísticas de operación:', error);
      throw error;
    }
  }

  /**
   * Obtener resumen diario de una operación
   */
  async getResumenDiario(operacionId: string): Promise<ResumenDiario | null> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const resumenRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/resumen_diario/resumen`
      );
      const resumenSnap = await getDoc(resumenRef);

      if (resumenSnap.exists()) {
        return { id: resumenSnap.id, ...resumenSnap.data() } as ResumenDiario;
      }
      return null;
    } catch (error) {
      console.error('❌ Error obteniendo resumen diario:', error);
      throw error;
    }
  }

  /**
   * Calcular total de facturas pagas para una operación
   */
  async calcularTotalFacturasPagas(operacionId: string): Promise<number> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      // Obtener todas las facturas de la operación
      const facturas = await this.getFacturasPendientes(operacionId);

      // Filtrar solo las facturas pagas y sumar sus montos
      const totalFacturasPagas = facturas
        .filter((factura) => factura.estado === 'pagada')
        .reduce((total, factura) => total + (factura.monto || 0), 0);

      console.log(
        `💰 Total de facturas pagas calculado para operación ${operacionId}:`,
        totalFacturasPagas
      );
      return totalFacturasPagas;
    } catch (error) {
      console.error('❌ Error calculando total de facturas pagas:', error);
      return 0;
    }
  }

  /**
   * Eliminar producto cargado físicamente de una operación
   */
  async eliminarProductoCargadoFisico(operacionId: string, productoId: string): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_cargados/${productoId}`
      );

      await deleteDoc(productoRef);
      console.log('✅ Producto cargado eliminado físicamente:', productoId);
    } catch (error) {
      console.error('❌ Error eliminando producto cargado físicamente:', error);
      throw error;
    }
  }

  /**
   * Eliminar producto no retornado físicamente de una operación
   */
  async eliminarProductoNoRetornadoFisico(operacionId: string, productoId: string): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_no_retornados/${productoId}`
      );

      await deleteDoc(productoRef);
      console.log('✅ Producto no retornado eliminado físicamente:', productoId);
    } catch (error) {
      console.error('❌ Error eliminando producto no retornado físicamente:', error);
      throw error;
    }
  }

  /**
   * Eliminar producto retornado físicamente de una operación
   */
  async eliminarProductoRetornadoFisico(operacionId: string, productoId: string): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_retornados/${productoId}`
      );

      await deleteDoc(productoRef);
      console.log('✅ Producto retornado eliminado físicamente:', productoId);
    } catch (error) {
      console.error('❌ Error eliminando producto retornado físicamente:', error);
      throw error;
    }
  }

  /**
   * Eliminar producto no retornado de una operación
   */
  async eliminarProductoNoRetornado(operacionId: string, productoId: string): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_no_retornados/${productoId}`
      );

      await updateDoc(productoRef, {
        eliminado: true,
        fechaEliminacion: new Date().toISOString(),
        eliminadoPor: 'admin',
      });

      console.log('✅ Producto no retornado eliminado:', productoId);
    } catch (error) {
      console.error('❌ Error eliminando producto no retornado:', error);
      throw error;
    }
  }

  /**
   * Eliminar producto retornado de una operación
   */
  async eliminarProductoRetornado(operacionId: string, productoId: string): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_retornados/${productoId}`
      );

      await updateDoc(productoRef, {
        eliminado: true,
        fechaEliminacion: new Date().toISOString(),
        eliminadoPor: 'admin',
      });

      console.log('✅ Producto retornado eliminado:', productoId);
    } catch (error) {
      console.error('❌ Error eliminando producto retornado:', error);
      throw error;
    }
  }

  /**
   * Eliminar gasto operativo físicamente de una operación
   */
  async eliminarGastoOperativo(operacionId: string, gastoId: string): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const gastoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/gastos/${gastoId}`
      );

      await deleteDoc(gastoRef);
      console.log('✅ Gasto operativo eliminado físicamente:', gastoId);
    } catch (error) {
      console.error('❌ Error eliminando gasto operativo físicamente:', error);
      throw error;
    }
  }

  /**
   * Eliminar factura pendiente de una operación (eliminado físico)
   */
  async eliminarFacturaPendiente(operacionId: string, facturaId: string): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const facturaRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/facturas_pendientes/${facturaId}`
      );

      await deleteDoc(facturaRef);
      console.log('✅ Factura pendiente eliminada físicamente:', facturaId);
    } catch (error) {
      console.error('❌ Error eliminando factura pendiente físicamente:', error);
      throw error;
    }
  }

  // === MÉTODOS OBSERVABLES PARA SINCRONIZACIÓN AUTOMÁTICA ===

  /**
   * Obtiene la operación activa de un distribuidor con sincronización automática
   * Optimizado para evitar índices compuestos complejos
   */
  getOperacionActivaRealtime(distribuidorId: string): Observable<OperacionDiaria | null> {
    try {
      // Usar el método de verificación de autenticación
      const authCheck = this.verificarEstadoAutenticacion();

      if (!authCheck.autenticado) {
        console.warn('⚠️ Usuario no autenticado para operación activa realtime');
        return of(null);
      }

      const userId = authCheck.userId!;

      console.log('🔄 Iniciando consulta realtime operación activa:', {
        distribuidorId,
        userId,
      });

      const operacionesRef = collection(this.firestore, `usuarios/${userId}/gestionDiaria`);

      // Query simplificada: solo filtramos por distribuidorId y estado
      // Ordenamos por fecha desc y limitamos a 1 para obtener la más reciente
      const q = query(
        operacionesRef,
        where('distribuidorId', '==', distribuidorId),
        where('estado', '==', 'activa'),
        orderBy('fecha', 'desc'),
        limit(1)
      );

      return collectionData(q, { idField: 'id' }).pipe(
        map((operaciones: any[]) => {
          console.log('📊 Operaciones activas encontradas:', operaciones.length);
          if (operaciones.length > 0) {
            console.log('✅ Operación activa:', operaciones[0]);
          } else {
            console.log('ℹ️ No hay operaciones activas para este distribuidor');
          }
          return operaciones.length > 0 ? operaciones[0] : null;
        }),
        catchError((error) => {
          console.error('❌ Error obteniendo operación activa en tiempo real:', error);
          return of(null);
        })
      );
    } catch (error) {
      console.error('❌ Error de autenticación en getOperacionActivaRealtime:', error);
      return of(null);
    }
  }

  /**
   * Obtiene productos cargados con sincronización automática
   */
  getProductosCargadosRealtime(operacionId: string): Observable<ProductoCargado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const productosRef = collection(
      this.firestore,
      `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_cargados`
    );
    return collectionData(productosRef, { idField: 'id' }).pipe(
      map((productos: any[]) =>
        productos.map((p) => ({
          ...p,
          fechaCarga: p.fechaCarga || new Date().toISOString(),
          cargadoPor: p.cargadoPor || 'admin',
        }))
      ),
      catchError((error) => {
        console.error('❌ Error obteniendo productos cargados en tiempo real:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene productos no retornados con sincronización automática
   */
  getProductosNoRetornadosRealtime(operacionId: string): Observable<ProductoNoRetornado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const productosRef = collection(
      this.firestore,
      `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_no_retornados`
    );
    return collectionData(productosRef, { idField: 'id' }).pipe(
      map((productos: any[]) =>
        productos.map((p) => ({
          ...p,
          fechaRegistro: p.fechaRegistro || new Date().toISOString(),
          registradoPor: p.registradoPor || 'admin',
        }))
      ),
      catchError((error) => {
        console.error('❌ Error obteniendo productos no retornados en tiempo real:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene productos retornados con sincronización automática
   */
  getProductosRetornadosRealtime(operacionId: string): Observable<ProductoRetornado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const productosRef = collection(
      this.firestore,
      `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_retornados`
    );
    return collectionData(productosRef, { idField: 'id' }).pipe(
      map((productos: any[]) =>
        productos.map((p) => ({
          ...p,
          fechaRegistro: p.fechaRegistro || new Date().toISOString(),
          registradoPor: p.registradoPor || 'admin',
        }))
      ),
      catchError((error) => {
        console.error('❌ Error obteniendo productos retornados en tiempo real:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene gastos operativos con sincronización automática
   */
  getGastosOperativosRealtime(operacionId: string): Observable<GastoOperativo[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const gastosRef = collection(
      this.firestore,
      `usuarios/${this.userId}/gestionDiaria/${operacionId}/gastos`
    );
    return collectionData(gastosRef, { idField: 'id' }).pipe(
      map((gastos: any[]) =>
        gastos.map((g) => ({
          ...g,
          fechaGasto: g.fechaGasto || new Date().toISOString(),
          registradoPor: g.registradoPor || 'admin',
        }))
      ),
      catchError((error) => {
        console.error('❌ Error obteniendo gastos operativos en tiempo real:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene facturas pendientes con sincronización automática
   */
  getFacturasPendientesRealtime(operacionId: string): Observable<FacturaPendiente[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const facturasRef = collection(
      this.firestore,
      `usuarios/${this.userId}/gestionDiaria/${operacionId}/facturas_pendientes`
    );
    return collectionData(facturasRef, { idField: 'id' }).pipe(
      map((facturas: any[]) =>
        facturas
          .filter((f) => !f.eliminado) // Filtrar facturas eliminadas
          .map((f) => ({
            ...f,
            fechaRegistro: f.fechaRegistro || new Date().toISOString(),
            registradoPor: f.registradoPor || 'admin',
          }))
      ),
      catchError((error) => {
        console.error('❌ Error obteniendo facturas pendientes en tiempo real:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene operaciones por distribuidor en un rango de fechas con sincronización automática
   */
  getOperacionesPorDistribuidorRealtime(
    distribuidorId: string,
    fechaInicio: string,
    fechaFin: string
  ): Observable<OperacionDiaria[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);
    const q = query(
      operacionesRef,
      where('distribuidorId', '==', distribuidorId),
      orderBy('fecha', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map((operaciones: any[]) => {
        // Filtrar por fecha en el cliente para evitar índices compuestos
        const operacionesFiltradas = operaciones.filter(
          (op) => op.fecha >= fechaInicio && op.fecha <= fechaFin
        );
        return operacionesFiltradas.map((op) => ({
          ...op,
          createdAt: op.createdAt || new Date().toISOString(),
          updatedAt: op.updatedAt || new Date().toISOString(),
        }));
      }),
      catchError((error) => {
        console.error('❌ Error obteniendo operaciones por distribuidor en tiempo real:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtiene facturas pendientes globales por fecha con sincronización automática
   * Busca en todas las operaciones del distribuidor que coincidan con la fecha especificada
   */
  getFacturasPendientesPorFechaRealtime(
    distribuidorId: string,
    fecha: string
  ): Observable<FacturaPendiente[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    // Obtener operaciones del distribuidor en un rango amplio de fechas
    // para evitar problemas con índices compuestos
    const fechaInicio = new Date(fecha);
    fechaInicio.setDate(fechaInicio.getDate() - 30); // 30 días antes
    const fechaFin = new Date(fecha);
    fechaFin.setDate(fechaFin.getDate() + 30); // 30 días después

    const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);
    const q = query(
      operacionesRef,
      where('distribuidorId', '==', distribuidorId),
      orderBy('fecha', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      // Filtrar operaciones por fecha en el cliente
      map((operaciones: any[]) => {
        const operacionesFiltradas = operaciones.filter(
          (op) =>
            op.fecha >= fechaInicio.toISOString().split('T')[0] &&
            op.fecha <= fechaFin.toISOString().split('T')[0]
        );
        return operacionesFiltradas;
      }),
      // Para cada operación, obtener sus facturas pendientes
      switchMap((operaciones) => {
        if (operaciones.length === 0) {
          return of([]);
        }

        const facturasObservables = operaciones.map((operacion) => {
          const facturasRef = collection(
            this.firestore,
            `usuarios/${this.userId}/gestionDiaria/${operacion.id}/facturas_pendientes`
          );
          return collectionData(facturasRef, { idField: 'id' }).pipe(
            map((facturas: any[]) =>
              facturas
                .filter((f) => !f.eliminado) // Filtrar facturas eliminadas
                .map((f) => ({
                  ...f,
                  operacionId: operacion.id, // Agregar referencia a la operación
                  fechaRegistro: f.fechaRegistro || new Date().toISOString(),
                  registradoPor: f.registradoPor || 'admin',
                  // Agregar información de la operación para identificar el origen
                  _operacionFecha: operacion.fecha,
                  _operacionId: operacion.id,
                }))
            ),
            catchError((error) => {
              console.error(`❌ Error obteniendo facturas de operación ${operacion.id}:`, error);
              return of([]);
            })
          );
        });

        // Combinar todas las facturas de todas las operaciones
        return combineLatest(facturasObservables).pipe(
          map((facturasArrays) => {
            const todasLasFacturas = facturasArrays.flat();
            // Filtrar facturas que coincidan exactamente con la fecha especificada
            return todasLasFacturas.filter((f) => f._operacionFecha === fecha);
          }),
          catchError((error) => {
            console.error('❌ Error combinando facturas de operaciones:', error);
            return of([]);
          })
        );
      }),
      catchError((error) => {
        console.error('❌ Error obteniendo operaciones para facturas por fecha:', error);
        return of([]);
      })
    );
  }
}
