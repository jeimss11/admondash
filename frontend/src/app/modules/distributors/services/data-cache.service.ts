import { Injectable } from '@angular/core';

/**
 * Servicio de caché para optimizar consultas y reducir llamadas a Firestore
 *
 * Uso:
 * ```typescript
 * // En el servicio
 * const cached = this.cache.get<Venta[]>('ventas-distribuidor-seller1');
 * if (cached) return cached;
 *
 * const ventas = await this.fetchFromFirestore();
 * this.cache.set('ventas-distribuidor-seller1', ventas);
 * ```
 */
@Injectable({ providedIn: 'root' })
export class DataCacheService {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos por defecto

  /**
   * Obtiene un valor del caché si existe y no ha expirado
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      console.log(`📦 Cache MISS: ${key}`);
      return null;
    }

    // Verificar si ha expirado
    if (Date.now() - entry.timestamp > entry.ttl) {
      console.log(`⏰ Cache EXPIRED: ${key}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`✅ Cache HIT: ${key}`);
    return entry.data as T;
  }

  /**
   * Guarda un valor en el caché con tiempo de vida personalizado
   */
  set(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl}ms)`);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Invalida todas las entradas que coincidan con un patrón
   * Útil cuando se actualiza un recurso
   */
  invalidate(pattern: string): void {
    console.log(`🗑️ Cache INVALIDATE: ${pattern}`);
    let invalidatedCount = 0;

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    console.log(`   Invalidadas ${invalidatedCount} entradas`);
  }

  /**
   * Invalida una clave específica
   */
  invalidateKey(key: string): void {
    console.log(`🗑️ Cache INVALIDATE KEY: ${key}`);
    this.cache.delete(key);
  }

  /**
   * Limpia todo el caché
   */
  clear(): void {
    console.log('🧹 Cache CLEAR ALL');
    this.cache.clear();
  }

  /**
   * Obtiene estadísticas del caché
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.entries());
    const now = Date.now();

    const expired = entries.filter(([_, entry]) => now - entry.timestamp > entry.ttl).length;

    const valid = entries.length - expired;

    return {
      totalEntries: entries.length,
      validEntries: valid,
      expiredEntries: expired,
      cacheKeys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Precarga datos en el caché (útil para datos frecuentes)
   */
  preload(key: string, dataLoader: () => Promise<any>, ttl?: number): void {
    console.log(`🔄 Cache PRELOAD: ${key}`);

    dataLoader()
      .then((data) => {
        this.set(key, data, ttl);
      })
      .catch((error) => {
        console.error(`❌ Error preloading cache for ${key}:`, error);
      });
  }

  /**
   * Obtiene o carga datos (patrón cache-aside)
   */
  async getOrLoad<T>(key: string, loader: () => Promise<T>, ttl?: number): Promise<T> {
    // Intentar obtener del caché
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Si no existe, cargar y guardar
    console.log(`🔄 Cache LOAD: ${key}`);
    const data = await loader();
    this.set(key, data, ttl);
    return data;
  }
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

interface CacheStats {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  cacheKeys: string[];
}
