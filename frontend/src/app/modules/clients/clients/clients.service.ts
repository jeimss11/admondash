import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
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
    const ref = doc(this.clientsCollection);
    await setDoc(ref, { ...cliente, id: ref.id });
    return ref.id;
  }

  async getClientes(): Promise<Cliente[]> {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    const snapshot = await getDocs(this.clientsCollection);
    return snapshot.docs.map((doc) => doc.data() as Cliente);
  }

  async updateCliente(cliente: Cliente) {
    if (!this.clientsCollection || !cliente.id) throw new Error('Datos incompletos');
    const ref = doc(this.clientsCollection, cliente.id);
    await updateDoc(ref, { ...cliente });
  }

  async deleteCliente(id: string) {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.clientsCollection, id);
    await deleteDoc(ref);
  }
}
