import { AsyncPipe, NgForOf, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MobileDashboardService } from '../../../core/integration/mobile-dashboard.service';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AsyncPipe, NgForOf, NgIf, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly dashboard = inject(MobileDashboardService);
  readonly business = inject(BusinessContextService);
  readonly operatorSession = inject(OperatorSessionService);
}
