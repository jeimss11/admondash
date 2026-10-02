import { Injectable, inject } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  Query,
  collection,
  collectionData,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import {
  MOBILE_DOCUMENT_ID_FIELD,
  readMobileClient,
  readMobileCollection,
  readMobileExpense,
  readMobileProduct,
  readMobileSale,
} from './mobile-contract';
import type {
  ContractReader,
  MobileClient,
  MobileCollectionResult,
  MobileExpense,
  MobileProduct,
  MobileSale,
  RejectedMobileDocument,
} from './mobile-contract';

export { readMobileCollection } from './mobile-contract';
export type { MobileCollectionResult, RejectedMobileDocument } from './mobile-contract';

/** Read-only access to the Firestore collections written by impresora. */
@Injectable({ providedIn: 'root' })
export class MobileFirestoreRepository {
  private readonly firestore = inject(Firestore);

  watchSales(ownerUid: string): Observable<MobileCollectionResult<MobileSale>> {
    return this.watchCollection(ownerUid, 'ventas', readMobileSale);
  }

  watchSalesForBusinessDate(
    ownerUid: string,
    businessDate: string
  ): Observable<MobileCollectionResult<MobileSale>> {
    return this.watchCollection(ownerUid, 'ventas', readMobileSale, (reference) =>
      query(reference, where('fecha2', '==', businessDate))
    );
  }

  watchProducts(ownerUid: string): Observable<MobileCollectionResult<MobileProduct>> {
    return this.watchCollection(ownerUid, 'productos', readMobileProduct);
  }

  watchClients(ownerUid: string): Observable<MobileCollectionResult<MobileClient>> {
    return this.watchCollection(ownerUid, 'clientes', readMobileClient);
  }

  watchExpenses(ownerUid: string): Observable<MobileCollectionResult<MobileExpense>> {
    return this.watchCollection(ownerUid, 'gastos', readMobileExpense);
  }

  watchExpensesForBusinessDate(
    ownerUid: string,
    businessDate: string
  ): Observable<MobileCollectionResult<MobileExpense>> {
    return this.watchCollection(ownerUid, 'gastos', readMobileExpense, (reference) =>
      query(reference, where('date2', '==', businessDate.replaceAll('-', '')))
    );
  }

  private watchCollection<T>(
    ownerUid: string,
    collectionName: 'ventas' | 'productos' | 'clientes' | 'gastos',
    reader: ContractReader<T>,
    constrain?: (reference: CollectionReference<DocumentData>) => Query<DocumentData>
  ): Observable<MobileCollectionResult<T>> {
    if (ownerUid.trim().length === 0) {
      throw new Error('No se puede consultar una colección sin el identificador del negocio.');
    }

    const reference = collection(
      this.firestore,
      `usuarios/${ownerUid}/${collectionName}`
    ) as CollectionReference<DocumentData>;

    return collectionData(constrain?.(reference) ?? reference, { idField: MOBILE_DOCUMENT_ID_FIELD }).pipe(
      map((documents) => readMobileCollection(documents, reader))
    );
  }
}
