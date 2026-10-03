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
  runTransaction,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { Cliente } from '../../../shared/models/cliente.model';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  constructor(private firestore: Firestore, private businessContext: BusinessContextService) {}

  private get userId(): string | undefined {
    return this.businessContext.requireOwnerUid();
  }

  private get clientsCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/clientes`);
  }

  async addCliente(cliente: Cliente) {
    const assertSession = this.captureSession();
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    if (!cliente.local?.trim() || cliente.local.includes('/')) throw new Error('El local debe tener una clave válida sin barras.');
    const ref = doc(this.clientsCollection, cliente.local);
    await runTransaction(this.firestore, async (transaction) => {
      assertSession();
      const existing = await transaction.get(ref);
      if (existing.exists()) throw new Error('Ya existe un cliente con ese local. Edita el registro existente.');
      assertSession();
      transaction.set(ref, { ...cliente, eliminado: false, ultima_modificacion: serverTimestamp() });
    });
  }

  getClientes(): Observable<Cliente[]> {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    const q = query(this.clientsCollection, where('eliminado', '==', false)); // Filtra clientes no eliminados
    return collectionData(q, { idField: 'local' }) as Observable<Cliente[]>; // Escucha cambios en tiempo real
  }

  async updateCliente(cliente: Cliente) {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    if (!cliente.local?.trim() || cliente.local.includes('/')) throw new Error('El local debe tener una clave válida sin barras.');
    const ref = doc(this.clientsCollection, cliente.local); // Usa 'local' como clave primaria
    await updateDoc(ref, { ...cliente, ultima_modificacion: serverTimestamp() });
  }

  async deleteCliente(local: string) {
    if (!this.clientsCollection) throw new Error('Usuario no autenticado');
    if (!local?.trim() || local.includes('/')) throw new Error('El local debe tener una clave válida sin barras.');
    const ref = doc(this.clientsCollection, local); // Usa 'local' como clave primaria
    await updateDoc(ref, { eliminado: true, ultima_modificacion: serverTimestamp() }); // Realiza borrado lógico
  }

  private captureSession(): () => void {
    const initial = this.businessContext.context();
    if (initial.status === 'signed-out') throw new Error('Usuario no autenticado.');
    return () => {
      const current = this.businessContext.context();
      if (current.status === 'signed-out' || current.ownerUid !== initial.ownerUid || current.actorUid !== initial.actorUid) {
        throw new Error('La sesión cambió. Revisa la operación antes de continuar.');
      }
    };
  }
}
