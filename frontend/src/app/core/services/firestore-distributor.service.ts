import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Firestore, getFirestore } from 'firebase/firestore';
import { environmentDistributor } from '../../../environments/environment.distributor';

@Injectable({
  providedIn: 'root',
})
export class FirestoreDistributorService {
  private distributorApp: FirebaseApp;
  private distributorFirestore: Firestore;

  constructor() {
    this.distributorApp = initializeApp(environmentDistributor.firebase, 'distributorApp');
    this.distributorFirestore = getFirestore(this.distributorApp);
  }

  get db() {
    return this.distributorFirestore;
  }

  // Ejemplo de método para obtener una colección:
  // async getVentas() {
  //   const ventasCol = collection(this.db, 'ventas');
  //   const ventasSnapshot = await getDocs(ventasCol);
  //   return ventasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // }
}
