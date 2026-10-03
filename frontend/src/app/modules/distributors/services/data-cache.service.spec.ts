import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BusinessContext, BusinessContextService } from '../../../core/integration/business-context.service';
import { DataCacheService } from './data-cache.service';

describe('DataCacheService isolation', () => {
  let context: BehaviorSubject<BusinessContext>;
  let cache: DataCacheService;
  beforeEach(() => {
    context = new BehaviorSubject<BusinessContext>({ status: 'owner', ownerUid: 'A', actorUid: 'A', email: null });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: BusinessContextService, useValue: { context$: context.asObservable() } }] });
    cache = TestBed.inject(DataCacheService);
  });

  it('does not expose the previous business under the same filter key', () => {
    cache.set('seller1', ['private-A']);
    context.next({ status: 'owner', ownerUid: 'B', actorUid: 'B', email: null });
    expect(cache.get('seller1')).toBeNull();
  });

  it('rejects an old response instead of repopulating the new session', async () => {
    let finish!: (value: string[]) => void;
    const request = cache.getOrLoad('seller1', () => new Promise<string[]>((resolve) => { finish = resolve; }));
    context.next({ status: 'owner', ownerUid: 'B', actorUid: 'B', email: null });
    finish(['private-A']);
    await expectAsync(request).toBeRejectedWithError(/sesión o los datos cambiaron/);
    expect(cache.get('seller1')).toBeNull();
  });

  it('does not repopulate invalidated data with a pending response', async () => {
    let finish!: (value: string[]) => void;
    const request = cache.getOrLoad('sales', () => new Promise<string[]>((resolve) => { finish = resolve; }));
    cache.invalidate('sales'); finish(['old-sale']);
    await expectAsync(request).toBeRejectedWithError(/sesión o los datos cambiaron/);
    expect(cache.get('sales')).toBeNull();
  });
});
