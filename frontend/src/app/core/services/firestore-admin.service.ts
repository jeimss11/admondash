import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class FirestoreAdminService {
  constructor(private afs: AngularFirestore) {}

  // Ejemplo: obtener todos los clientes
  getClientes(): Observable<any[]> {
    return this.afs.collection('clientes').valueChanges({ idField: 'id' });
  }

  // Ejemplo: agregar un cliente
  addCliente(cliente: any) {
    return this.afs.collection('clientes').add(cliente);
  }

  // Puedes agregar métodos similares para productos, ventas, gastos, etc.
}
