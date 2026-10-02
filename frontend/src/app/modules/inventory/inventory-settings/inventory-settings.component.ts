import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, switchMap } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { InventoryConfiguration, InventoryMode } from '../services/inventory-configuration.policy';
import { InventoryConfigurationService } from '../services/inventory-configuration.service';

@Component({
  selector: 'app-inventory-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-settings.html',
  styleUrl: './inventory-settings.scss',
})
export class InventorySettingsComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly context = inject(BusinessContextService);
  readonly configurationService = inject(InventoryConfigurationService);
  private readonly subscription = new Subscription();

  mode: InventoryMode = 'central';
  lowStockThreshold = 5;
  changeNote = '';
  loading = true;
  saving = false;
  error: string | null = null;
  savedMessage: string | null = null;

  get canSave(): boolean {
    return this.configurationService.enabled && this.changeNote.trim().length >= 10 && !this.saving;
  }

  ngOnInit(): void {
    this.subscription.add(
      this.context.context$.pipe(
        switchMap((business) => {
          if (business.status === 'signed-out') throw new Error('Debe iniciar sesión para configurar inventario.');
          return this.configurationService.watch(business.ownerUid);
        })
      ).subscribe({
        next: (configuration) => this.apply(configuration),
        error: (error: unknown) => {
          this.error = error instanceof Error ? error.message : 'No fue posible leer la configuración.';
          this.loading = false;
        },
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  async save(): Promise<void> {
    this.error = null;
    this.savedMessage = null;
    this.saving = true;
    try {
      await this.configurationService.save(
        { mode: this.mode, lowStockThreshold: this.lowStockThreshold },
        this.changeNote
      );
      this.changeNote = '';
      this.savedMessage = 'Configuración guardada para pruebas en el emulador.';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'No fue posible guardar la configuración.';
    } finally {
      this.saving = false;
    }
  }

  private apply(configuration: InventoryConfiguration): void {
    this.mode = configuration.mode;
    this.lowStockThreshold = configuration.lowStockThreshold;
    this.loading = false;
  }

  goBack() {
    this.router.navigate(['/inventory']);
  }
}
