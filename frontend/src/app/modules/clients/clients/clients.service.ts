import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Cliente } from '../../../shared/models/cliente.model';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  constructor(private firestore: Firestore, private auth: Auth) {}

  private get userId(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  private get clientsCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/clientes`);
  }

  async addCliente(cliente: Cliente) {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.clientsCollection, cliente.local); // Usa 'local' como clave primaria
    await setDoc(ref, { ...cliente, eliminado: false, ultima_modificacion: serverTimestamp() });
  }

  getClientes(): Observable<Cliente[]> {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    const q = query(this.clientsCollection, where('eliminado', '==', false)); // Filtra clientes no eliminados
    return collectionData(q, { idField: 'local' }) as Observable<Cliente[]>; // Escucha cambios en tiempo real
  }

  async updateCliente(cliente: Cliente) {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.clientsCollection, cliente.local); // Usa 'local' como clave primaria
    await updateDoc(ref, { ...cliente, ultima_modificacion: serverTimestamp() });
  }

  async deleteCliente(local: string) {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.clientsCollection, local); // Usa 'local' como clave primaria
    await updateDoc(ref, { eliminado: true, ultima_modificacion: serverTimestamp() }); // Realiza borrado lógico
  }
}
