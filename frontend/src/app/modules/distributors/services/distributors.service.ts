import { Injectable } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
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
  throwError,
} from 'rxjs';
import {
  Distribuidor,
  DistribuidorEstadisticas,
  DistribuidorVenta,
  EstadisticasOperacion,
  FacturaPendiente,
  GastoOperativo,
  // Nuevos modelos para gesti�n diaria completa
  OperacionDiaria,
  ProductoCargado,
  ProductoNoRetornado,
  ProductoRetornado,
  ResumenDiario,
} from '../models/distributor.models';
import { DataCacheService } from './data-cache.service';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';
import { colombiaBusinessDate, colombiaBusinessDateDaysAgo } from '../../../core/integration/business-date';
import { normalizePaymentCancellationReason } from './payment-audit.policy';
import { administrativeInvoiceId, persistInvoiceCollection } from './invoice-payment.policy';
import { calculateKnownExpectedCash } from './cash-reconciliation.policy';
import { persistActiveOperationRecord } from './operation-record.policy';

@Injectable({ providedIn: 'root' })
export class DistributorsService {
  constructor(
    private firestore: Firestore,
    private businessContext: BusinessContextService,
    private operatorSession: OperatorSessionService,
    private cache: DataCacheService // ?? Sistema de cach�
  ) {
    console.log('? DistributorsService inicializado con sistema de cach�');
  }

  private get userId(): string | undefined {
    const context = this.businessContext.context();
    return context.status === 'signed-out' ? undefined : context.ownerUid;
  }

  /**
   * This mirrors the owner-session operator picker. It is a UI-level guard;
   * production Firestore authorization still depends on the authenticated UID.
   */
  private requireAdministrator(): void {
    if (!this.operatorSession.isAdministrator()) {
      throw new Error('Seleccione el usuario operativo Administrador para administrar distribuidores.');
    }
  }

  private async createActiveOperationRecord(reference: DocumentReference, data: DocumentData): Promise<void> {
    this.requireAdministrator();
    const context = this.businessContext.context();
    if (context.status === 'signed-out' || !reference.path.startsWith(`usuarios/${context.ownerUid}/gestionDiaria/`)) {
      throw new Error('La operación no corresponde a la sesión del negocio.');
    }
    if (data['cantidad'] !== undefined && (!Number.isFinite(data['cantidad']) || data['cantidad'] <= 0)) {
      throw new Error('La cantidad debe ser un número positivo; se admiten cantidades fraccionarias.');
    }
    for (const field of ['monto', 'precioUnitario', 'costoUnitario', 'total', 'totalPerdida', 'totalValor']) {
      if (data[field] !== undefined && (!Number.isFinite(data[field]) || data[field] < 0)) {
        throw new Error('El movimiento contiene importes inválidos.');
      }
    }
    await persistActiveOperationRecord(this.firestore, reference, data, () => {
      const current = this.businessContext.context();
      if (current.status === 'signed-out' || current.ownerUid !== context.ownerUid || current.actorUid !== context.actorUid) {
        throw new Error('La sesión cambió durante el registro de la operación.');
      }
      this.requireAdministrator();
    });
  }

  /**
   * Verifica el estado de autenticaci�n del usuario
   */
  verificarEstadoAutenticacion(): { autenticado: boolean; userId?: string; error?: string } {
    try {
      const userId = this.userId;
      if (userId) {
        console.log('? Usuario autenticado:', userId);
        return { autenticado: true, userId };
      } else {
        console.warn('?? Usuario no autenticado');
        return { autenticado: false, error: 'Usuario no autenticado' };
      }
    } catch (error) {
      console.error('? Error verificando autenticaci�n:', error);
      return { autenticado: false, error: String(error) };
    }
  }

  /**
   * M�todo de diagn�stico para verificar la sincronizaci�n
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

      const operaciones = await firstValueFrom(this.getOperacionActivaOptimizada(distribuidorId));

      if (!operaciones || !Array.isArray(operaciones)) {
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
      console.error('? Error en diagn�stico de sincronizaci�n:', error);
      return {
        autenticacion: this.verificarEstadoAutenticacion(),
        operacionesActivas: 0,
        error: String(error),
      };
    }
  }

  /**
   * M�todo auxiliar para obtener fecha de hace 30 d�as
   */
  private getFechaHace30Dias(): string {
    return colombiaBusinessDateDaysAgo(30);
  }

  /**
   * M�todo auxiliar para obtener fecha de hoy
   */
  private getTodayDate(): string {
    return colombiaBusinessDate();
  }

  private get ventasCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/ventas`);
  }

  private get distribuidoresCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/roleData`);
  }

  // Ventas de distribuidores del d�a actual (OPTIMIZADO)
  // IMPORTANTE: Usa fecha2 para filtrado porque tiene formato yyyy-mm-dd
  // compatible con comparaciones de strings y consultas de Firestore
  getVentasDistribuidoresHoyOptimizado(): Observable<DistribuidorVenta[]> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');

    const fechaHoy = colombiaBusinessDate(); // Formato yyyy-mm-dd

    console.log('?? [OPTIMIZADO] Buscando ventas para fecha:', fechaHoy);

    // OPTIMIZACI�N: Filtrar por fecha2 directamente en Firestore
    const q = query(
      this.ventasCollection,
      where('eliminado', '==', false),
      where('fecha2', '==', fechaHoy), // Fecha exacta en lugar de rango
      where('role', '!=', '') // Solo roles v�lidos
    );

    return collectionData(q, { idField: 'factura' }).pipe(
      map((docs) => docs as DistribuidorVenta[]),
      tap((ventas: DistribuidorVenta[]) => {
        console.log('?? [OPTIMIZADO] Ventas encontradas en Firestore:', ventas.length);
      }),
      catchError((error) => {
        console.error('? Error obteniendo ventas optimizadas:', error);
        return of([]);
      })
    );
  }

  // Ventas de distribuidores del d�a actual (VERSI�N SIMPLIFICADA - FALLBACK)
  // IMPORTANTE: Filtra por fecha2 en el cliente porque tiene formato yyyy-mm-dd
  getVentasDistribuidoresHoySimple(): Observable<DistribuidorVenta[]> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${year}-${month}-${day}`; // Formato yyyy-mm-dd

    console.log('?? [SIMPLE] Buscando ventas para fecha:', fechaHoy);

    // OBTENER TODAS LAS VENTAS NO ELIMINADAS (sin filtro de fecha en Firestore)
    const q = query(this.ventasCollection, where('eliminado', '==', false));

    return collectionData(q, { idField: 'factura' }).pipe(
      map((docs) => docs as DistribuidorVenta[]),
      tap((ventas: DistribuidorVenta[]) => {
        console.log('?? [SIMPLE] Total ventas en Firestore:', ventas.length);
      }),
      map((ventas: DistribuidorVenta[]) =>
        ventas.filter((venta: DistribuidorVenta) => {
          // FILTRAR POR FECHA2 Y ROLE EN EL CLIENTE
          const fechaVenta = venta.fecha2; // Usar fecha2 para comparaci�n
          const fechaValida = fechaVenta === fechaHoy;
          const hasRole = venta.role && venta.role.trim() !== '';

          console.log('?? [SIMPLE] Filtrando venta:', {
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
        console.log('? [SIMPLE] Ventas del d�a encontradas:', ventasFiltradas.length);
        ventasFiltradas.forEach((venta, index) => {
          console.log(`   Venta ${index + 1}: ${venta.factura} - ${venta.total} - ${venta.role}`);
        });
        // Una consulta de ventas no debe crear ni modificar distribuidores.
      })
    );
  }

  async addVentaInterna(
    venta: Omit<DistribuidorVenta, 'id' | 'fecha' | 'fecha2' | 'eliminado' | 'ultima_modificacion'>
  ): Promise<void> {
    void venta;
    throw new Error(
      'Las ventas nuevas del escritorio deben registrarse en ventas_appweb; no se crearán documentos automáticos en ventas móviles.'
    );
  }

  async addVentaExterna(
    venta: Omit<DistribuidorVenta, 'id' | 'fecha' | 'fecha2' | 'eliminado' | 'ultima_modificacion'>
  ): Promise<void> {
    void venta;
    throw new Error(
      'Las ventas nuevas del escritorio deben registrarse en ventas_appweb; no se crearán documentos automáticos en ventas móviles.'
    );
  }

  async updateVentaInterna(venta: DistribuidorVenta): Promise<void> {
    void venta;
    throw new Error(
      'El escritorio no actualiza ventas móviles desde Distribuidores. Use un flujo de corrección compatible y aprobado.'
    );
  }

  async updateVentaExterna(venta: DistribuidorVenta): Promise<void> {
    void venta;
    throw new Error(
      'El escritorio no actualiza ventas móviles desde Distribuidores. Use un flujo de corrección compatible y aprobado.'
    );
  }

  // Marcar una venta como pagada
  /**
   * Preserved for legacy callers, but desktop collections cannot change the
   * payment state of a mobile sale. Payments belong to the operation's
   * administrative invoice records until mobile credit is explicitly designed.
   */
  async markVentaAsPaid(factura: string, montoTotal: number): Promise<void> {
    void factura;
    void montoTotal;
    throw new Error(
      'El pago se registra en la operación administrativa; el escritorio no cambia ventas móviles.'
    );
  }

  // Preserved for legacy callers; see markVentaAsPaid.
  async markVentaAsAbonada(
    factura: string,
    montoPagado: number,
    montoPendiente: number
  ): Promise<void> {
    void factura;
    void montoPagado;
    void montoPendiente;
    throw new Error(
      'El abono se registra en la operación administrativa; el escritorio no cambia ventas móviles.'
    );
  }

  async deleteVentaInterna(factura: string): Promise<void> {
    void factura;
    throw new Error(
      'El escritorio no elimina ventas móviles. Corrija o audite la información desde el flujo autorizado de la aplicación móvil.'
    );
  }

  /**
   * ?? M�todo auxiliar para invalidar cach� de ventas
   * Se llama cuando se crea, actualiza o elimina una venta
   */
  private invalidateVentasCache(factura?: string): void {
    console.log('??? Invalidando cach� de ventas...');

    // Invalidar todos los cach�s de ventas (patr�n amplio)
    this.cache.invalidate('ventas-');
    this.cache.invalidate('estadisticas-');

    // Si hay factura espec�fica, invalidar su cach� individual
    if (factura) {
      this.cache.invalidateKey(`venta-${factura}`);
    }
  }

  /**
   * ?? M�todo auxiliar para invalidar cach� de operaci�n diaria
   * Se llama cuando se registran productos, gastos o se modifican facturas
   */
  private invalidateOperacionCache(operacionId: string): void {
    console.log('??? Invalidando cach� de operaci�n:', operacionId);

    // Invalidar estad�sticas calculadas (es el m�s costoso)
    this.cache.invalidateKey(`estadisticas_operacion_${this.userId}_${operacionId}`);

    // Las operaciones activas se guardan por distribuidor con guiones, no por
    // usuario con guiones bajos. Invalidar el prefijo evita mostrar una
    // operación cerrada o recién abierta durante el TTL.
    this.cache.invalidate('operacion-activa-');

    // Estas listas se vuelven a consultar tras cualquier cambio operativo.
    // De otro modo un registro exitoso puede permanecer invisible hasta que
    // expire el caché del navegador.
    this.cache.invalidateKey(`productos-cargados-${operacionId}`);
    this.cache.invalidateKey(`facturas-pendientes-${operacionId}`);
  }

  async deleteVentaExterna(factura: string): Promise<void> {
    void factura;
    throw new Error(
      'El escritorio no elimina ventas móviles. Corrija o audite la información desde el flujo autorizado de la aplicación móvil.'
    );
  }

  // === DISTRIBUIDORES ===

  // Obtener todos los distribuidores
  getDistribuidores(): Observable<Distribuidor[]> {
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');
    return collectionData(this.distribuidoresCollection, { idField: 'role' }) as Observable<
      Distribuidor[]
    >;
  }

  // Obtener distribuidor espec�fico por role
  // ?? CON CACH�: Los distribuidores no cambian frecuentemente
  async getDistribuidorByRole(role: string): Promise<Distribuidor | null> {
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');

    try {
      // ?? CLAVE DE CACH� para distribuidor espec�fico
      const cacheKey = `distribuidor-${role}`;

      // ?? Usar cach� con TTL largo (distribuidores son datos semi-est�ticos)
      return await this.cache.getOrLoad(
        cacheKey,
        async () => {
          console.log(`?? Consultando Firestore para distribuidor: ${role}`);
          const docRef = doc(this.distribuidoresCollection!, role);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            return {
              role: docSnap.id,
              ...docSnap.data(),
            } as Distribuidor;
          } else {
            return null;
          }
        },
        10 * 60 * 1000 // TTL: 10 minutos (distribuidores cambian poco)
      );
    } catch (error) {
      console.error('Error obteniendo distribuidor por role:', error);
      throw error;
    }
  }

  // Agregar nuevo distribuidor
  async addDistribuidor(distribuidor: any): Promise<void> {
    this.requireAdministrator();
    if (!this.distribuidoresCollection) {
      throw new Error('Usuario no autenticado');
    }

    const nuevoDistribuidor: any = {
      ...distribuidor,
      fechaRegistro: colombiaBusinessDate(),
    };

    const docRef = doc(this.distribuidoresCollection, nuevoDistribuidor.role);
    await runTransaction(this.firestore, async (transaction) => {
      const existing = await transaction.get(docRef);
      if (existing.exists()) throw new Error('El rol ya está asignado a otro distribuidor.');
      transaction.set(docRef, { ...nuevoDistribuidor, ultima_modificacion: serverTimestamp() });
    });
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
      throw error;
    }
  }

  // Actualizar distribuidor
  async updateDistribuidor(distribuidor: Distribuidor): Promise<void> {
    this.requireAdministrator();
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');

    // Validar que el role no est� vac�o
    if (!distribuidor.role || distribuidor.role.trim() === '') {
      throw new Error('El rol del distribuidor no puede estar vac�o');
    }

    const docRef = doc(this.distribuidoresCollection, distribuidor.role);
    await updateDoc(docRef, {
      ...distribuidor,
      ultima_modificacion: serverTimestamp(),
    });
  }

  // Eliminar distribuidor (marcar como inactivo)
  async deleteDistribuidor(role: string): Promise<void> {
    this.requireAdministrator();
    if (!this.distribuidoresCollection) throw new Error('Usuario no autenticado');
    const docRef = doc(this.distribuidoresCollection, role);
    await updateDoc(docRef, {
      estado: 'inactivo',
      ultima_modificacion: serverTimestamp(),
    });
  }

  // M�todo auxiliar para encontrar documento por n�mero de factura
  private async findDocByFactura(
    collection: CollectionReference<DocumentData>,
    factura: string
  ): Promise<any> {
    const q = query(collection, where('factura', '==', factura));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      throw new Error(`No se encontr� venta con factura: ${factura}`);
    }

    if (snapshot.size > 1) {
      throw new Error(`M�ltiples ventas encontradas con factura: ${factura}`);
    }

    return snapshot.docs[0].ref;
  }

  // M�todo auxiliar para convertir fecha del formato dd-mm-yyyy a yyyy-mm-dd
  private convertirFechaAlFormato(fechaStr: string): string {
    if (!fechaStr) return '';

    // Si ya est� en formato yyyy-mm-dd, devolver como est�
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

  // Estad�sticas diarias optimizadas (solo datos del d�a actual)
  getEstadisticasDiarias(): Observable<DistribuidorEstadisticas> {
    if (!this.userId) {
      return of(this.getEstadisticasVacias());
    }

    // USAR M�TODO SIMPLIFICADO PARA MEJOR COMPATIBILIDAD
    return combineLatest([
      this.getDistribuidores().pipe(catchError(() => of([]))),
      this.getVentasDistribuidoresHoySimple().pipe(catchError(() => of([]))),
    ]).pipe(
      map(([distribuidores, ventasHoy]) => {
        console.log('?? Estad�sticas calculadas:', {
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
          totalVentasInternas: 0, // No necesitamos totales hist�ricos
          totalVentasExternas: 0, // No necesitamos totales hist�ricos
          ventasHoyInternas: ventasHoyInternas.length,
          ventasHoyExternas: ventasHoyExternas.length,
          totalIngresosInternos: ingresosHoyInternos, // Ingresos de hoy
          totalIngresosExternos: ingresosHoyExternos, // Ingresos de hoy
        };

        console.log('?? Resultado final:', resultado);
        return resultado;
      }),
      catchError((error) => {
        console.error('? Error obteniendo estad�sticas diarias:', error);
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

  // Generar n�mero de factura �nico
  async generarNumeroFactura(tipo: 'interno' | 'externo' = 'interno'): Promise<string> {
    const fecha = new Date();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');

    const prefijo = tipo === 'interno' ? 'DI' : 'DE'; // DI = Distribuidor Interno, DE = Distribuidor Externo

    // Obtener el �ltimo n�mero de factura del d�a para el tipo correspondiente
    const ventasHoy = await this.getVentasHoy(tipo);
    const ultimoNumero = ventasHoy.length + 1;

    return `${prefijo}${year}${month}${day}${String(ultimoNumero).padStart(3, '0')}`;
  }

  private async getVentasHoy(tipo: 'interno' | 'externo'): Promise<DistribuidorVenta[]> {
    if (!this.ventasCollection) return [];

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${year}-${month}-${day}`;

    // Para ma�ana (fin del d�a de hoy)
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const yearManana = manana.getFullYear();
    const monthManana = String(manana.getMonth() + 1).padStart(2, '0');
    const dayManana = String(manana.getDate()).padStart(2, '0');
    const fechaManana = `${yearManana}-${monthManana}-${dayManana}`;

    const q = query(
      this.ventasCollection,
      where('eliminado', '==', false),
      where('fecha2', '>=', fechaHoy),
      where('fecha2', '<', fechaManana)
    );

    const snapshot = await getDocs(q);
    const ventas = snapshot.docs.map(
      (doc) => ({ factura: doc.id, ...doc.data() } as DistribuidorVenta)
    );

    // Filtrar por tipo de distribuidor basado en el role
    const rolePrefix = tipo === 'interno' ? 'seller' : 'clientSeller';
    return ventas.filter(
      (venta) => venta.role?.startsWith(rolePrefix) && venta.role && venta.role.trim() !== ''
    );
  }

  // Obtener ventas de un distribuidor espec�fico por role
  // ?? CON CACH�: Este es uno de los m�todos m�s usados
  async getVentasByDistribuidorRole(role: string): Promise<DistribuidorVenta[]> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');

    try {
      // ?? EJEMPLO DE CACH� CON getOrLoad
      const cacheKey = `ventas-role-${role}`;

      return await this.cache.getOrLoad(
        cacheKey,
        async () => {
          // ?? Solo se ejecuta si el cach� no existe o expir�
          console.log(`?? Consultando Firestore para role: ${role}`);

          const q = query(
            this.ventasCollection!,
            where('eliminado', '==', false),
            where('role', '==', role)
          );

          const snapshot = await getDocs(q);
          const ventas = snapshot.docs.map(
            (doc) =>
              ({
                factura: doc.id,
                ...doc.data(),
              } as DistribuidorVenta)
          );

          console.log(`? Ventas de ${role} obtenidas de Firestore: ${ventas.length}`);
          return ventas;
        },
        5 * 60 * 1000 // TTL: 5 minutos
      );
    } catch (error) {
      console.error('Error obteniendo ventas por role:', error);
      return [];
    }
  }

  // Obtener ventas de un distribuidor espec�fico por role (TIEMPO REAL)
  getVentasByDistribuidorRoleRealtime(role: string): Observable<DistribuidorVenta[]> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');

    const q = query(
      this.ventasCollection,
      where('eliminado', '==', false),
      where('role', '==', role)
    );

    return collectionData(q, { idField: 'factura' }).pipe(
      map((docs) => docs as DistribuidorVenta[]),
      tap((ventas: DistribuidorVenta[]) => {
        console.log(`?? [REALTIME] Ventas actualizadas para ${role}:`, ventas.length);
      }),
      catchError((error) => {
        console.error('? Error en listener realtime:', error);
        return of([]);
      })
    );
  }

  // Obtener ventas de un distribuidor de los �ltimos 7 d�as
  // ?? CON CACH�: Reduce llamadas a Firestore
  async getVentasByDistribuidorLast7Days(role: string): Promise<DistribuidorVenta[]> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');

    try {
      // Calcular fecha de hace 7 d�as
      const fechaDesde = colombiaBusinessDateDaysAgo(7);

      // ?? PASO 1: Definir clave de cach� �nica
      const cacheKey = `ventas-7dias-${role}-${fechaDesde}`;

      // ?? PASO 2: Usar getOrLoad - obtiene del cach� o carga si no existe
      return await this.cache.getOrLoad(
        cacheKey,
        async () => {
          // Esta funci�n solo se ejecuta si NO hay cach�
          console.log(`?? [7 D�AS] Consultando Firestore para ${role} desde ${fechaDesde}`);

          const q = query(
            this.ventasCollection!,
            where('eliminado', '==', false),
            where('role', '==', role),
            where('fecha2', '>=', fechaDesde)
          );

          const snapshot = await getDocs(q);
          const ventas = snapshot.docs.map(
            (doc) =>
              ({
                factura: doc.id,
                ...doc.data(),
              } as DistribuidorVenta)
          );

          console.log(`? [7 D�AS] Ventas obtenidas de Firestore: ${ventas.length}`);
          return ventas;
        },
        3 * 60 * 1000 // TTL: 3 minutos (datos cambian frecuentemente)
      );
    } catch (error) {
      console.error('? Error obteniendo ventas de los �ltimos 7 d�as:', error);
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

  // === M�TODOS PARA GESTI�N DE D�A ===

  // Obtener estado del d�a actual para un distribuidor
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
      console.error('? Error obteniendo estado del d�a:', error);
      return null;
    }
  }

  // Obtener historial de d�as para un distribuidor
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
      console.error('? Error obteniendo historial de d�as:', error);
      return [];
    }
  }

  // Abrir d�a para un distribuidor
  async abrirDia(apertura: any): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const diaId = `${apertura.distribuidorId}_${apertura.fecha}`;
      const diaRef = doc(this.firestore, `usuarios/${this.userId}/dias/${diaId}`);

      await setDoc(diaRef, {
        ...apertura,
        fechaCreacion: serverTimestamp(),
      });

      console.log('? D�a abierto correctamente:', diaId);
    } catch (error) {
      console.error('? Error abriendo d�a:', error);
      throw error;
    }
  }

  // Cerrar d�a para un distribuidor
  async cerrarDia(cierre: any): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const diaId = `${cierre.distribuidorId}_${cierre.fecha}`;
      const diaRef = doc(this.firestore, `usuarios/${this.userId}/dias/${diaId}`);

      await updateDoc(diaRef, {
        ...cierre,
        fechaCreacion: serverTimestamp(),
      });

      console.log('? D�a cerrado correctamente:', diaId);
    } catch (error) {
      console.error('? Error cerrando d�a:', error);
      throw error;
    }
  }

  // Calcular estad�sticas del d�a para un distribuidor
  async calcularEstadisticasDia(distribuidorId: string, fecha: string): Promise<any> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      // Obtener ventas del d�a
      const ventas = await this.getVentasByDistribuidorRoleAndDate(distribuidorId, fecha);

      let ventasTotales = 0;
      let productosVendidos: any[] = [];
      let dineroInicial = 0;

      // Calcular estad�sticas de ventas
      ventas.forEach((venta: any) => {
        ventasTotales += parseFloat(venta.total?.toString() || '0');

        if (venta.productos && Array.isArray(venta.productos)) {
          productosVendidos.push(...venta.productos);
        }
      });

      // Obtener dinero inicial del d�a si existe
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
        dineroFinal: 0, // Se calcular� al cerrar el d�a
        diferencia: 0, // Se calcular� al cerrar el d�a
        productosDefectuosos: 0,
        productosCaducados: 0,
        ajustesTotales: 0,
        estado: 'normal',
      };
    } catch (error) {
      console.error('? Error calculando estad�sticas del d�a:', error);
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

  // M�todo auxiliar para obtener ventas por distribuidor y fecha
  /**
   * Lectura puntual para conciliar una operación administrativa con las ventas
   * móviles del mismo vendedor y fecha de negocio. No escribe ni modifica ventas.
   */
  async getVentasByDistribuidorRoleAndDate(
    distribuidorId: string,
    fecha: string
  ): Promise<any[]> {
    if (!this.userId) return [];

    try {
      const ventasCollection = collection(this.firestore, `usuarios/${this.userId}/ventas`);
      const q = query(
        ventasCollection,
        where('eliminado', '==', false),
        where('role', '==', distribuidorId),
        where('fecha2', '==', fecha)
      );

      const querySnapshot = await getDocs(q);
      const ventas: any[] = [];

      querySnapshot.forEach((doc) => {
        ventas.push({ ...doc.data(), id: doc.id });
      });

      return ventas;
    } catch (error) {
      console.error('? Error obteniendo ventas por fecha:', error);
      throw error;
    }
  }

  // ===========================================
  // ?? NUEVOS M�TODOS PARA GESTI�N DIARIA COMPLETA
  // ===========================================

  // === GESTI�N DE OPERACIONES DIARIAS ===

  /**
   * Crear una nueva operaci�n diaria
   */
  async crearOperacionDiaria(
    operacion: Omit<OperacionDiaria, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const operacionId = `${operacion.distribuidorId}_${operacion.fecha}`;
      this.requireAdministrator();
      if (!Number.isFinite(operacion.montoInicial) || operacion.montoInicial < 0) throw new Error('El monto inicial debe ser válido y no negativo.');
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

      await runTransaction(this.firestore, async (transaction) => {
        const existing = await transaction.get(operacionRef);
        if (existing.exists()) {
          throw new Error('Ya existe una operación administrativa para ese distribuidor y fecha.');
        }
        transaction.set(operacionRef, {
          ...nuevaOperacion,
          // La fecha civil conserva el día operativo. Esta marca es la fuente
          // confiable para ordenar y auditar modificaciones entre equipos.
          ultima_modificacion: serverTimestamp(),
        });
      });
      this.invalidateOperacionCache(operacionId);
      console.log('? Operaci�n diaria creada:', operacionId);
      return operacionId;
    } catch (error) {
      console.error('? Error creando operaci�n diaria:', error);
      throw error;
    }
  }

  /**
   * Obtener operaci�n diaria por ID
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
      console.error('? Error obteniendo operaci�n diaria:', error);
      throw error;
    }
  }

  /**
   * Obtener operaci�n activa de un distribuidor
   * ?? CON CACH�: Consultado frecuentemente en el dashboard
   */
  async getOperacionActiva(distribuidorId: string): Promise<OperacionDiaria | null> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      // ?? Cach� con TTL corto (operaci�n activa puede cambiar)
      const cacheKey = `operacion-activa-${distribuidorId}`;

      return await this.cache.getOrLoad(
        cacheKey,
        async () => {
          console.log(`?? Consultando Firestore para operaci�n activa: ${distribuidorId}`);

          const operacionesRef = collection(
            this.firestore,
            `usuarios/${this.userId}/gestionDiaria`
          );
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
        },
        2 * 60 * 1000 // TTL: 2 minutos (datos din�micos)
      );
    } catch (error) {
      console.error('? Error obteniendo operaci�n activa:', error);
      throw error;
    }
  }

  /**
   * Cerrar operaci�n diaria
   */
  async cerrarOperacionDiaria(operacionId: string, resumen: ResumenDiario): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    this.requireAdministrator();
    try {
      const operacionRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}`
      );
      const resumenRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/resumen_diario/resumen`
      );

      const before = await getDoc(operacionRef);
      if (!before.exists() || before.data()['estado'] !== 'activa') throw new Error('La operación ya no está activa.');
      const revision = before.data()['operationRevision'] ?? 0;
      const [expenses, invoices, mobileSales] = await Promise.all([
        getDocs(collection(operacionRef, 'gastos')),
        getDocs(collection(operacionRef, 'facturas_pendientes')),
        this.getVentasByDistribuidorRoleAndDate(before.data()['distribuidorId'], before.data()['fecha']),
      ]);
      const administrativeNumbers = new Set(invoices.docs.map((invoice) => invoice.data()['numeroFactura']));
      const collections = invoices.docs.reduce((sum, invoice) => sum + (invoice.data()['montoDelDia'] ?? 0), 0)
        + mobileSales.filter((sale) => sale.pagado === true && !administrativeNumbers.has(sale.factura))
          .reduce((sum, sale) => sum + Number(sale.total), 0);
      const totalExpenses = expenses.docs.reduce((sum, expense) => sum + expense.data()['monto'], 0);
      const expectedCash = calculateKnownExpectedCash({ openingAmount: before.data()['montoInicial'],
        confirmedCollections: collections, operatingExpenses: totalExpenses });
      if (Math.abs(expectedCash - resumen.dineroEsperado) > 0.001) {
        throw new Error('Los cobros o gastos cambiaron. Actualice la operación y revise el efectivo esperado antes de cerrar.');
      }
      if (!Number.isFinite(resumen.dineroEntregado) || resumen.dineroEntregado < 0) throw new Error('El efectivo entregado debe ser un monto válido.');

      await runTransaction(this.firestore, async (transaction) => {
        const operation = await transaction.get(operacionRef);
        // Mobile does not update operationRevision. Check the observed sale
        // documents too, so an edit/delete of known evidence cannot race this
        // close. New/offline mobile sales still require later reconciliation.
        const mobileSnapshots = await Promise.all(mobileSales.map((sale) => transaction.get(
          doc(operacionRef.parent.parent!, 'ventas', sale.id)
        )));
        for (let index = 0; index < mobileSales.length; index++) {
          const snapshot = mobileSnapshots[index];
          const observed = mobileSales[index];
          if (!snapshot.exists() || ['total', 'pagado', 'eliminado', 'factura', 'role', 'fecha2']
            .some((field) => snapshot.data()[field] !== observed[field])) {
            throw new Error('Una venta móvil cambió durante el cierre. Actualice la operación antes de cerrar.');
          }
        }
        if (!operation.exists()) {
          throw new Error('La operación que intenta cerrar ya no existe.');
        }
        if (operation.data()['estado'] !== 'activa') {
          throw new Error('Solo se puede cerrar una operación que está activa.');
        }

        if ((operation.data()['operationRevision'] ?? 0) !== revision) {
          throw new Error('La operación cambió mientras se cerraba. Revise sus valores y vuelva a intentar.');
        }
        transaction.update(operacionRef, {
          estado: 'cerrada',
          cerradoPor: resumen.cerradoPor,
          fechaCierre: resumen.fechaCierre,
          updatedAt: new Date().toISOString(),
          ultima_modificacion: serverTimestamp(),
        });
        transaction.set(resumenRef, {
          ...resumen,
          // `fechaCierre` remains the legacy/display field. Server timestamps
          // provide the authoritative modification and audit ordering signal.
          cerrado_en_servidor: serverTimestamp(),
          ultima_modificacion: serverTimestamp(),
        });
      });
      this.invalidateOperacionCache(operacionId);
      console.log('? Operaci�n diaria cerrada:', operacionId);
    } catch (error) {
      console.error('? Error cerrando operaci�n diaria:', error);
      throw error;
    }
  }

  // === GESTI�N DE PRODUCTOS CARGADOS ===

  /**
   * Agregar producto cargado a la operaci�n
   */
  async agregarProductoCargado(
    operacionId: string,
    producto: Omit<ProductoCargado, 'id' | 'operacionId'>,
    requestId?: string
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const productoId = requestId ? `carga_${encodeURIComponent(requestId)}` : `${producto.productoId}_${crypto.randomUUID()}`;
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_cargados/${productoId}`
      );

      const nuevoProducto: ProductoCargado = {
        ...producto,
        id: productoId,
        operacionId,
      };

      await this.createActiveOperationRecord(productoRef, nuevoProducto);
      this.invalidateOperacionCache(operacionId);
      console.log('? Producto cargado agregado:', productoId);
      return productoId;
    } catch (error) {
      console.error('? Error agregando producto cargado:', error);
      throw error;
    }
  }

  /**
   * Obtener productos cargados de una operaci�n
   * ?? CON CACH�: Lista consultada m�ltiples veces en el dashboard
   */
  async getProductosCargados(operacionId: string): Promise<ProductoCargado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const cacheKey = `productos-cargados-${operacionId}`;

      return await this.cache.getOrLoad(
        cacheKey,
        async () => {
          console.log(`?? Consultando productos cargados para operaci�n: ${operacionId}`);

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
        },
        5 * 60 * 1000 // TTL: 5 minutos
      );
    } catch (error) {
      console.error('? Error obteniendo productos cargados:', error);
      throw error;
    }
  }

  // === GESTI�N DE PRODUCTOS NO RETORNADOS ===

  /**
   * Registrar producto no retornado
   */
  async registrarProductoNoRetornado(
    operacionId: string,
    producto: Omit<ProductoNoRetornado, 'id' | 'operacionId'>,
    requestId?: string
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const itemId = `no_retornado_${requestId ? encodeURIComponent(requestId) : crypto.randomUUID()}`;
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_no_retornados/${itemId}`
      );

      const nuevoProducto: ProductoNoRetornado = {
        ...producto,
        id: itemId,
        operacionId,
      };

      await this.createActiveOperationRecord(productoRef, nuevoProducto);

      // ?? Invalidar cach� de productos no retornados y estad�sticas
      this.cache.invalidateKey(`productos_no_retornados_${this.userId}_${operacionId}`);
      this.invalidateOperacionCache(operacionId);

      console.log('? Producto no retornado registrado:', itemId);
      return itemId;
    } catch (error) {
      console.error('? Error registrando producto no retornado:', error);
      throw error;
    }
  }

  /**
   * Obtener productos no retornados de una operaci�n
   * ?? OPTIMIZADO: Cache de 5 minutos (datos de operaci�n en curso)
   */
  async getProductosNoRetornados(operacionId: string): Promise<ProductoNoRetornado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const cacheKey = `productos_no_retornados_${this.userId}_${operacionId}`;

    return this.cache.getOrLoad(
      cacheKey,
      async () => {
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
          console.error('? Error obteniendo productos no retornados:', error);
          throw error;
        }
      },
      5 * 60 * 1000 // 5 minutos
    );
  }

  // === GESTI�N DE PRODUCTOS RETORNADOS ===

  /**
   * Registrar producto retornado
   */
  async registrarProductoRetornado(
    operacionId: string,
    producto: Omit<ProductoRetornado, 'id' | 'operacionId'>,
    requestId?: string
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const itemId = `retornado_${requestId ? encodeURIComponent(requestId) : crypto.randomUUID()}`;
      const productoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/productos_retornados/${itemId}`
      );

      const nuevoProducto: ProductoRetornado = {
        ...producto,
        id: itemId,
        operacionId,
      };

      await this.createActiveOperationRecord(productoRef, nuevoProducto);

      // ?? Invalidar cach� de productos retornados y estad�sticas
      this.cache.invalidateKey(`productos_retornados_${this.userId}_${operacionId}`);
      this.invalidateOperacionCache(operacionId);

      console.log('? Producto retornado registrado:', itemId);
      return itemId;
    } catch (error) {
      console.error('? Error registrando producto retornado:', error);
      throw error;
    }
  }

  /**
   * Obtener productos retornados de una operaci�n
   * ?? OPTIMIZADO: Cache de 5 minutos (datos de operaci�n en curso)
   */
  async getProductosRetornados(operacionId: string): Promise<ProductoRetornado[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const cacheKey = `productos_retornados_${this.userId}_${operacionId}`;

    return this.cache.getOrLoad(
      cacheKey,
      async () => {
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
          console.error('? Error obteniendo productos retornados:', error);
          throw error;
        }
      },
      5 * 60 * 1000 // 5 minutos
    );
  }

  // === GESTI�N DE GASTOS OPERATIVOS ===

  /**
   * Registrar gasto operativo
   */
  async registrarGastoOperativo(
    operacionId: string,
    gasto: Omit<GastoOperativo, 'id' | 'operacionId'>,
    requestId?: string
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const gastoId = `gasto_${requestId ? encodeURIComponent(requestId) : crypto.randomUUID()}`;
      const gastoRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/gastos/${gastoId}`
      );

      const nuevoGasto: GastoOperativo = {
        ...gasto,
        id: gastoId,
        operacionId,
      };

      await this.createActiveOperationRecord(gastoRef, nuevoGasto);

      // ?? Invalidar cach� de gastos operativos y estad�sticas
      this.cache.invalidateKey(`gastos_operativos_${this.userId}_${operacionId}`);
      this.invalidateOperacionCache(operacionId);

      console.log('? Gasto operativo registrado:', gastoId);
      return gastoId;
    } catch (error) {
      console.error('? Error registrando gasto operativo:', error);
      throw error;
    }
  }

  /**
   * Obtener gastos operativos de una operaci�n
   * ?? OPTIMIZADO: Cache de 5 minutos (datos de operaci�n en curso)
   */
  async getGastosOperativos(operacionId: string): Promise<GastoOperativo[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const cacheKey = `gastos_operativos_${this.userId}_${operacionId}`;

    return this.cache.getOrLoad(
      cacheKey,
      async () => {
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
          console.error('? Error obteniendo gastos operativos:', error);
          throw error;
        }
      },
      5 * 60 * 1000 // 5 minutos
    );
  }

  // === GESTI�N DE FACTURAS PENDIENTES ===

  /**
   * Crear factura pendiente
   */
  async crearFacturaPendiente(
    operacionId: string,
    factura: Omit<FacturaPendiente, 'id' | 'operacionId'>
  ): Promise<string> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      this.requireAdministrator();
      const facturaId = administrativeInvoiceId(factura.numeroFactura);
      const facturaRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/facturas_pendientes/${facturaId}`
      );

      const nuevaFactura: FacturaPendiente = {
        ...factura,
        id: facturaId,
        operacionId,
      };

      const operationRef = doc(this.firestore, `usuarios/${this.userId}/gestionDiaria/${operacionId}`);
      await runTransaction(this.firestore, async (transaction) => {
        const [operation, existing] = await Promise.all([transaction.get(operationRef), transaction.get(facturaRef)]);
        if (!operation.exists() || operation.data()['estado'] !== 'activa') {
          throw new Error('Solo se pueden registrar facturas en una operación activa.');
        }
        if (existing.exists()) throw new Error('La factura ya tiene seguimiento administrativo en esta operación.');
        if (!Number.isFinite(factura.monto) || factura.monto <= 0) throw new Error('La factura requiere un monto positivo.');
        transaction.set(facturaRef, { ...nuevaFactura, ultima_modificacion: serverTimestamp() });
        transaction.update(operationRef, { operationRevision: (operation.data()['operationRevision'] ?? 0) + 1,
          ultima_modificacion: serverTimestamp() });
      });
      this.invalidateOperacionCache(operacionId);
      console.log('? Factura pendiente creada:', facturaId);
      return facturaId;
    } catch (error) {
      console.error('? Error creando factura pendiente:', error);
      throw error;
    }
  }

  /**
   * Obtener facturas pendientes de una operaci�n
   * ?? CON CACH�: Datos importantes consultados frecuentemente
   */
  async getFacturasPendientes(operacionId: string, fresh = false): Promise<FacturaPendiente[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const cacheKey = `facturas-pendientes-${operacionId}`;
      if (fresh) this.cache.invalidateKey(cacheKey);

      return await this.cache.getOrLoad(
        cacheKey,
        async () => {
          console.log(`?? Consultando facturas pendientes para operaci�n: ${operacionId}`);

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
        },
        3 * 60 * 1000 // TTL: 3 minutos (pueden cambiar frecuentemente)
      );
    } catch (error) {
      console.error('? Error obteniendo facturas pendientes:', error);
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
    void operacionId;
    void facturaId;
    void updates;
    throw new Error('Una factura administrativa no se modifica directamente. Registre un cobro o cancelación auditable.');
  }

  // === UTILIDADES Y ESTAD�STICAS ===

  /**
   * Calcular estad�sticas de una operaci�n
   * 🆕 OPTIMIZADO: Cache de 2 minutos (cálculos costosos con múltiples consultas)
   */
  async calcularEstadisticasOperacion(operacionId: string): Promise<EstadisticasOperacion> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const cacheKey = `estadisticas_operacion_${this.userId}_${operacionId}`;

    return this.cache.getOrLoad(
      cacheKey,
      async () => {
        try {
          const operacion = await this.getOperacionDiaria(operacionId);
          if (!operacion) throw new Error('Operaci�n no encontrada');

          // Obtener todos los datos de la operaci�n
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
            this.obtenerResumenDiario(operacion.distribuidorId, operacion.fecha),
          ]);

          // Calcular estad�sticas
          const totalProductosCargados = productosCargados.reduce(
            (sum: number, p: ProductoCargado) => sum + p.total,
            0
          );
          const totalProductosRetornados = productosRetornados.reduce(
            (sum: number, p: ProductoRetornado) => sum + (p.totalValor || 0),
            0
          );
          const totalProductosNoRetornados = productosNoRetornados.reduce(
            (sum: number, p: ProductoNoRetornado) => sum + p.totalPerdida,
            0
          );
          const totalGastos = gastos.reduce((sum: number, g: GastoOperativo) => sum + g.monto, 0);
          const totalPerdidas = productosNoRetornados.reduce(
            (sum: number, p: ProductoNoRetornado) => sum + p.totalPerdida,
            0
          );

          // Calcular total de facturas pagas
          const totalFacturasPagas = facturas
            .filter((factura: FacturaPendiente) => factura.estado === 'pagada')
            .reduce((total: number, factura: FacturaPendiente) => total + (factura.monto || 0), 0);

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
              facturasVencidas: facturas.some((f: FacturaPendiente) => f.estado === 'vencida'),
            },
          };

          return estadisticas;
        } catch (error) {
          console.error('? Error calculando estad�sticas de operaci�n:', error);
          throw error;
        }
      },
      2 * 60 * 1000 // 2 minutos - cálculos intensivos pero datos dinámicos
    );
  }

  /**
   * Obtener resumen diario de una operaci�n por distribuidor y fecha
   */
  async obtenerResumenDiario(distribuidorId: string, fecha: string): Promise<ResumenDiario | null> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      console.log(
        `?? Buscando resumen diario para distribuidor ${distribuidorId} en fecha ${fecha}`
      );

      // Primero obtener la operaci�n por distribuidor y fecha
      const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);
      const q = query(
        operacionesRef,
        where('distribuidorId', '==', distribuidorId),
        where('fecha', '==', fecha),
        where('estado', '==', 'cerrada')
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log(
          `?? No se encontraron operaciones cerradas para distribuidor ${distribuidorId} en fecha ${fecha}`
        );
        return null;
      }

      const operacionDoc = querySnapshot.docs[0];
      const operacionId = operacionDoc.id;
      const operacionData = operacionDoc.data();

      console.log(`?? Operaci�n encontrada: ${operacionId} - Estado: ${operacionData['estado']}`);

      // Ahora obtener el resumen diario de esa operaci�n
      const resumenRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/resumen_diario/resumen`
      );
      const resumenSnap = await getDoc(resumenRef);

      if (resumenSnap.exists()) {
        const resumenData = resumenSnap.data();
        console.log(`? Resumen diario encontrado para operaci�n ${operacionId}:`, resumenData);
        return { id: resumenSnap.id, ...resumenData } as ResumenDiario;
      } else {
        console.warn(
          `?? No se encontr� resumen diario en la ruta esperada para operaci�n ${operacionId}`
        );
        return null;
      }
    } catch (error) {
      console.error('? Error obteniendo resumen diario:', error);
      // En lugar de relanzar el error, devolver null para que la aplicaci�n contin�e
      return null;
    }
  }

  getVentasOperacionRealtime(distribuidorId: string, fecha: string): Observable<any[]> {
    const ownerUid = this.userId;
    if (!ownerUid) throw new Error('Usuario no autenticado');
    const sales = collection(this.firestore, `usuarios/${ownerUid}/ventas`);
    return collectionData(query(sales, where('eliminado', '==', false),
      where('role', '==', distribuidorId), where('fecha2', '==', fecha)), { idField: 'id' });
  }

  /** Atomic collection with immutable receipt; never updates a mobile sale. */
  async registrarCobroFactura(operacionId: string, factura: FacturaPendiente, amount: number | 'remaining', requestId?: string): Promise<void> {
    const ownerUid = this.userId;
    if (!ownerUid) throw new Error('Usuario no autenticado');
    this.requireAdministrator();
    const context = this.businessContext.context();
    if (context.status === 'signed-out') throw new Error('No hay una sesión de negocio activa.');
    const actorUid = context.actorUid;
    await persistInvoiceCollection(this.firestore, ownerUid, operacionId, factura, amount, actorUid, requestId);
    this.invalidateOperacionCache(operacionId);
  }

  /** Cancels only administrative payment evidence, keeping both invoice and audit record. */
  async cancelarPagoAdministrativo(
    operacionId: string,
    facturaId: string,
    actorUid: string,
    reason: string
  ): Promise<void> {
    if (!this.userId) throw new Error('Usuario no autenticado');
    this.requireAdministrator();
    const normalizedReason = normalizePaymentCancellationReason(reason);
    const normalizedActor = actorUid.trim();
    if (!normalizedActor) throw new Error('La cancelación requiere el responsable administrativo.');
    const context = this.businessContext.context();
    if (context.status === 'signed-out' || normalizedActor !== context.actorUid) {
      throw new Error('El responsable de la cancelación no corresponde a la sesión actual.');
    }

    const invoiceRef = doc(
      this.firestore,
      `usuarios/${this.userId}/gestionDiaria/${operacionId}/facturas_pendientes/${facturaId}`
    );
    const auditRef = doc(collection(invoiceRef, 'auditoria_cobros'));
    const operationRef = doc(this.firestore, `usuarios/${this.userId}/gestionDiaria/${operacionId}`);

    await runTransaction(this.firestore, async (transaction) => {
      const [operation, invoice] = await Promise.all([transaction.get(operationRef), transaction.get(invoiceRef)]);
      if (!operation.exists() || operation.data()['estado'] !== 'activa') throw new Error('La operación ya no está activa.');
      if (!invoice.exists()) throw new Error('No existe un cobro administrativo para cancelar.');
      const data = invoice.data();
      if (data['estado'] !== 'pagada' && data['estado'] !== 'parcial') {
        throw new Error('Solo se puede cancelar un cobro que esté pagado o parcial.');
      }

      transaction.set(auditRef, {
        type: 'cancelacion_cobro',
        actorUid: normalizedActor,
        reason: normalizedReason,
        previousState: data['estado'],
        previousMontoPagado: data['montoPagado'] ?? 0,
        previousMontoDelDia: data['montoDelDia'] ?? 0,
        createdAt: serverTimestamp(),
      });
      transaction.update(invoiceRef, {
        estado: 'pendiente',
        montoPagado: 0,
        montoDelDia: 0,
        ultima_modificacion: serverTimestamp(),
      });
      transaction.update(operationRef, { operationRevision: (operation.data()['operationRevision'] ?? 0) + 1,
        ultima_modificacion: serverTimestamp() });
    });
    this.invalidateOperacionCache(operacionId);
  }

  /**
   * Lee el resumen desde la operación ya identificada. A diferencia de la
   * búsqueda histórica por fecha, no depende de una fecha de cierre con hora
   * ni requiere una consulta compuesta adicional.
   */
  async obtenerResumenDiarioPorOperacion(operacionId: string): Promise<ResumenDiario | null> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const resumenRef = doc(
        this.firestore,
        `usuarios/${this.userId}/gestionDiaria/${operacionId}/resumen_diario/resumen`
      );
      const resumenSnap = await getDoc(resumenRef);
      return resumenSnap.exists()
        ? ({ id: resumenSnap.id, ...resumenSnap.data() } as ResumenDiario)
        : null;
    } catch (error) {
      console.error('Error obteniendo resumen diario por operación:', error);
      return null;
    }
  }

  /**
   * Calcular total de facturas pagas para una operaci�n
   */
  async calcularTotalFacturasPagas(operacionId: string): Promise<number> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      // Obtener todas las facturas de la operaci�n
      const facturas = await this.getFacturasPendientes(operacionId);

      // Filtrar solo las facturas pagas y sumar sus montos
      const totalFacturasPagas = facturas
        .filter((factura: FacturaPendiente) => factura.estado === 'pagada')
        .reduce((total: number, factura: FacturaPendiente) => total + (factura.monto || 0), 0);

      console.log(
        `?? Total de facturas pagas calculado para operaci�n ${operacionId}:`,
        totalFacturasPagas
      );
      return totalFacturasPagas;
    } catch (error) {
      console.error('? Error calculando total de facturas pagas:', error);
      return 0;
    }
  }

  /** Deshabilitado: un movimiento debe corregirse con una reversión auditable. */
  async eliminarProductoCargadoFisico(operacionId: string, productoId: string): Promise<void> {
    void operacionId;
    void productoId;
    throw new Error('No se eliminan cargas auditadas. Registre una corrección administrativa.');
  }

  /** Deshabilitado: un movimiento debe corregirse con una reversión auditable. */
  async eliminarProductoNoRetornadoFisico(operacionId: string, productoId: string): Promise<void> {
    void operacionId;
    void productoId;
    throw new Error('No se eliminan pérdidas auditadas. Registre una corrección administrativa.');
  }

  /** Deshabilitado: un movimiento debe corregirse con una reversión auditable. */
  async eliminarProductoRetornadoFisico(operacionId: string, productoId: string): Promise<void> {
    void operacionId;
    void productoId;
    throw new Error('No se eliminan devoluciones auditadas. Registre una corrección administrativa.');
  }

  /** @deprecated A loss is immutable evidence; use an auditable correction. */
  async eliminarProductoNoRetornado(operacionId: string, productoId: string): Promise<void> {
    void operacionId;
    void productoId;
    throw new Error('No se ocultan pérdidas auditadas. Registre una corrección administrativa con motivo.');
  }

  /** @deprecated A return is immutable evidence; use an auditable correction. */
  async eliminarProductoRetornado(operacionId: string, productoId: string): Promise<void> {
    void operacionId;
    void productoId;
    throw new Error('No se ocultan devoluciones auditadas. Registre una corrección administrativa con motivo.');
  }

  /** Deshabilitado: un gasto debe corregirse sin borrar su evidencia. */
  async eliminarGastoOperativo(operacionId: string, gastoId: string): Promise<void> {
    void operacionId;
    void gastoId;
    throw new Error('No se eliminan gastos auditados. Registre una corrección administrativa.');
  }

  /** Deshabilitado: la cartera se corrige conservando el comprobante. */
  async eliminarFacturaPendiente(operacionId: string, facturaId: string): Promise<void> {
    void operacionId;
    void facturaId;
    throw new Error('No se eliminan facturas administrativas. Cancele o corrija el movimiento.');
  }

  // === M�TODOS OBSERVABLES PARA SINCRONIZACI�N AUTOM�TICA ===

  /**
   * Obtiene las operaciones activas de un distribuidor de manera OPTIMIZADA
   * Usa consulta directa en lugar de listener amplio
   */
  getOperacionActivaOptimizada(distribuidorId: string): Observable<OperacionDiaria[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);

    // OPTIMIZACI�N: Consulta directa con filtros compuestos
    const q = query(
      operacionesRef,
      where('distribuidorId', '==', distribuidorId),
      where('estado', '==', 'activa'),
      orderBy('fecha', 'desc'),
      limit(1) // Solo necesitamos la m�s reciente
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map((operaciones: any[]) => {
        if (operaciones.length > 0) {
          console.log('? Operaciones activas encontradas (optimizada):', operaciones);
          return operaciones;
        }
        console.log('?? No hay operaciones activas para este distribuidor');
        return [];
      }),
      catchError((error) => {
        console.error('? Error obteniendo operaciones activas optimizada:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene productos cargados con sincronizaci�n autom�tica
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
          fechaCarga: typeof p.fechaCarga === 'string' ? p.fechaCarga : '',
          cargadoPor: typeof p.cargadoPor === 'string' ? p.cargadoPor : '',
        }))
      ),
      catchError((error) => {
        console.error('? Error obteniendo productos cargados en tiempo real:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene productos no retornados con sincronizaci�n autom�tica
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
          fechaRegistro: typeof p.fechaRegistro === 'string' ? p.fechaRegistro : '',
          registradoPor: typeof p.registradoPor === 'string' ? p.registradoPor : '',
        }))
      ),
      catchError((error) => {
        console.error('? Error obteniendo productos no retornados en tiempo real:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene productos retornados con sincronizaci�n autom�tica
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
          fechaRegistro: typeof p.fechaRegistro === 'string' ? p.fechaRegistro : '',
          registradoPor: typeof p.registradoPor === 'string' ? p.registradoPor : '',
        }))
      ),
      catchError((error) => {
        console.error('? Error obteniendo productos retornados en tiempo real:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene gastos operativos con sincronizaci�n autom�tica
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
          fechaGasto: typeof g.fechaGasto === 'string' ? g.fechaGasto : '',
          registradoPor: typeof g.registradoPor === 'string' ? g.registradoPor : '',
        }))
      ),
      catchError((error) => {
        console.error('? Error obteniendo gastos operativos en tiempo real:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene facturas pendientes con sincronizaci�n autom�tica
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
            fechaRegistro: typeof f.fechaRegistro === 'string' ? f.fechaRegistro : '',
            registradoPor: typeof f.registradoPor === 'string' ? f.registradoPor : '',
          }))
      ),
      catchError((error) => {
        console.error('? Error obteniendo facturas pendientes en tiempo real:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene facturas pendientes globales por fecha con sincronizaci�n autom�tica
   * OPTIMIZADO: Busca directamente operaciones de la fecha espec�fica para minimizar lecturas
   */
  getFacturasPendientesPorFechaRealtime(
    distribuidorId: string,
    fecha: string
  ): Observable<FacturaPendiente[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);

    // OPTIMIZACI�N: Buscar directamente la operaci�n de la fecha espec�fica
    // en lugar de un rango amplio de �30 d�as
    const q = query(
      operacionesRef,
      where('distribuidorId', '==', distribuidorId),
      where('fecha', '==', fecha) // Fecha exacta en lugar de rango amplio
    );

    return collectionData(q, { idField: 'id' }).pipe(
      // Para cada operaci�n de esa fecha, obtener sus facturas pendientes
      switchMap((operaciones) => {
        if (operaciones.length === 0) {
          return of([]);
        }

        const facturasObservables = operaciones.map((operacion) => {
          const facturasRef = collection(
            this.firestore,
            `usuarios/${this.userId}/gestionDiaria/${operacion.id}/facturas_pendientes`
          );

          // No se filtra por `eliminado` en Firestore: el histórico puede no
          // tener ese campo y debe seguir siendo legible. El filtrado local
          // conserva los documentos que no están marcados explícitamente.
          return collectionData(facturasRef, { idField: 'id' }).pipe(
            map((facturas: any[]) =>
              facturas
                .filter((f) => !f.eliminado)
                .map((f) => ({
                  ...f,
                  operacionId: operacion.id,
                  fechaRegistro: typeof f.fechaRegistro === 'string' ? f.fechaRegistro : '',
                  registradoPor: typeof f.registradoPor === 'string' ? f.registradoPor : '',
                  _operacionFecha: operacion['fecha'],
                  _operacionId: operacion.id,
                }))
            ),
            catchError((error) => {
              console.error(`? Error obteniendo facturas de operaci�n ${operacion.id}:`, error);
              return throwError(() => error);
            })
          );
        });

        // Combinar todas las facturas de las operaciones de esa fecha
        return combineLatest(facturasObservables).pipe(
          map((facturasArrays) => facturasArrays.flat()),
          catchError((error) => {
            console.error('? Error combinando facturas de operaciones:', error);
            return throwError(() => error);
          })
        );
      }),
      catchError((error) => {
        console.error('? Error obteniendo operaciones para facturas por fecha:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Verifica si ya existe una operaci�n (activa o cerrada) para una fecha espec�fica
   */
  async verificarOperacionExistente(
    distribuidorId: string,
    fecha: string
  ): Promise<{ existe: boolean; operacion?: OperacionDiaria }> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    try {
      const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);

      // Buscar operaciones con la fecha espec�fica (activas o cerradas)
      const q = query(
        operacionesRef,
        where('distribuidorId', '==', distribuidorId),
        where('fecha', '==', fecha)
      );

      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const operacion = snapshot.docs[0].data() as OperacionDiaria;
        operacion.id = snapshot.docs[0].id;

        console.log(`?? Ya existe una operaci�n para la fecha ${fecha}:`, operacion);
        return { existe: true, operacion };
      }

      return { existe: false };
    } catch (error) {
      console.error('? Error verificando operaci�n existente:', error);
      throw error;
    }
  }

  /**
   * Obtiene operaciones cerradas para el historial (�ltimos 10 d�as)
   */
  getOperacionesCerradasParaHistorial(distribuidorId: string): Observable<OperacionDiaria[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);

    // Calcular fecha hace 10 d�as (cambiado de 30 a 10 d�as)
    const fechaDesde = colombiaBusinessDateDaysAgo(10);

    // Consulta para operaciones cerradas en los �ltimos 10 d�as
    const q = query(
      operacionesRef,
      where('distribuidorId', '==', distribuidorId),
      where('estado', '==', 'cerrada'),
      where('fecha', '>=', fechaDesde),
      orderBy('fecha', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map((operaciones: any[]) => {
        console.log('? Operaciones cerradas para historial (10 d�as):', operaciones.length);
        return operaciones;
      }),
      catchError((error) => {
        console.error('? Error obteniendo operaciones cerradas para historial:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtiene operaciones cerradas con filtros de fecha espec�ficos (para filtrado avanzado)
   */
  getOperacionesCerradasConFiltros(
    distribuidorId: string,
    fechaDesde?: string,
    fechaHasta?: string
  ): Observable<OperacionDiaria[]> {
    if (!this.userId) throw new Error('Usuario no autenticado');

    const operacionesRef = collection(this.firestore, `usuarios/${this.userId}/gestionDiaria`);

    // Construir consulta con filtros opcionales
    let q = query(
      operacionesRef,
      where('distribuidorId', '==', distribuidorId),
      where('estado', '==', 'cerrada')
    );

    // Agregar filtro de fecha desde si se proporciona
    if (fechaDesde) {
      q = query(q, where('fecha', '>=', fechaDesde));
    }

    // Agregar filtro de fecha hasta si se proporciona
    if (fechaHasta) {
      q = query(q, where('fecha', '<=', fechaHasta));
    }

    // Ordenar por fecha descendente
    q = query(q, orderBy('fecha', 'desc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map((operaciones: any[]) => {
        console.log(
          `? Operaciones cerradas filtradas (${fechaDesde || 'sin l�mite'} - ${
            fechaHasta || 'sin l�mite'
          }):`,
          operaciones.length
        );
        return operaciones;
      }),
      catchError((error) => {
        console.error('? Error obteniendo operaciones cerradas con filtros:', error);
        return throwError(() => error);
      })
    );
  }
}
