import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { readWebSaleReportRecord, type WebSaleReportRecord } from './web-sales-report.contract';

/** Read-only reporting boundary for desktop-owned sales. */
@Injectable({ providedIn: 'root' })
export class WebSalesReportRepository {
  private readonly firestore = inject(Firestore);

  watchSalesForBusinessDate(ownerUid: string, date: string): Observable<WebSaleReportRecord[]> {
    const sales = query(
      collection(this.firestore, `usuarios/${ownerUid}/ventas_appweb`),
      where('fecha2', '==', date)
    );
    return collectionData(sales, { idField: '__webDocumentId' }).pipe(
      map((documents) =>
        documents.map((document) => {
          const raw = document as Record<string, unknown>;
          return readWebSaleReportRecord(String(raw['__webDocumentId'] ?? ''), raw);
        })
      )
    );
  }
}

