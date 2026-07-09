import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlPolicy, validationSchemeLabel } from '../../structures/ml-policy';
import { MlServedModel } from '../../structures/ml-training';

type PolicySortKey = 'createdAt' | 'oosPnl' | 'trainingRunCount' | 'riskPerTrade' | 'served';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-policies-page',
  templateUrl: './ml-policies-page.component.html',
  styleUrls: ['./ml-policies-page.component.css'],
  imports: [RouterLink, FormsModule, DecimalPipe],
})
export class MlPoliciesPageComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  policies: MlPolicy[] = [];
  servedModels: MlServedModel[] = [];
  isLoading = true;
  loadError: string | null = null;

  symbolFilter = '';
  intervalFilter = '';
  servedFilter: 'all' | 'served' | 'not-served' = 'all';
  hasRunsFilter: 'all' | 'yes' | 'no' = 'all';
  sortKey: PolicySortKey = 'createdAt';
  sortDir: 'asc' | 'desc' = 'desc';

  readonly trackById = (_: number, policy: MlPolicy): number => policy.id;
  readonly validationSchemeLabel = validationSchemeLabel;

  ngOnInit(): void {
    this.load();
  }

  get symbols(): string[] {
    return [...new Set(this.policies.map(p => p.symbolCode).filter(Boolean))].sort();
  }

  get intervals(): string[] {
    return [...new Set(this.policies.map(p => p.intervalCode).filter(Boolean))].sort();
  }

  get newestSchemaVersion(): string | number | null {
    const versions = this.servedModels.map(model => model.schemaVersion).filter(version => version !== null && version !== undefined);
    return versions.length ? String(versions.sort().at(-1)) : null;
  }

  get filteredPolicies(): MlPolicy[] {
    const rows = this.policies.filter(policy => {
      const served = this.servedFor(policy);
      if (this.symbolFilter && policy.symbolCode !== this.symbolFilter) return false;
      if (this.intervalFilter && policy.intervalCode !== this.intervalFilter) return false;
      if (this.servedFilter === 'served' && !served) return false;
      if (this.servedFilter === 'not-served' && served) return false;
      if (this.hasRunsFilter === 'yes' && (policy.trainingRunCount ?? 0) === 0) return false;
      if (this.hasRunsFilter === 'no' && (policy.trainingRunCount ?? 0) > 0) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      const av = this.sortValue(a);
      const bv = this.sortValue(b);
      const result = av === bv ? a.id - b.id : av > bv ? 1 : -1;
      return this.sortDir === 'asc' ? result : -result;
    });
  }

  load(): void {
    this.isLoading = true;
    this.loadError = null;
    forkJoin({
      policies: this.api.getPolicies(),
      served: this.api.getServedModels().pipe(catchError(() => of([] as MlServedModel[]))),
    }).subscribe({
      next: ({ policies, served }) => {
        this.policies = policies;
        this.servedModels = served;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadError = 'Could not load ML policies.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  setSort(key: PolicySortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = key === 'riskPerTrade' ? 'asc' : 'desc';
    }
  }

  servedFor(policy: MlPolicy): MlServedModel | null {
    return (
      this.servedModels.find(model => this.policyId(model) === policy.id && model.served !== false && this.servedRunId(model) !== null) ?? null
    );
  }

  servedRunId(model: MlServedModel | null): number | null {
    return model?.servedTrainingRunId ?? model?.trainingRunId ?? null;
  }

  policyId(model: MlServedModel): number {
    return model.mlPolicyId ?? model.policyId ?? 0;
  }

  oosPnl(model: MlServedModel | null): number | null {
    return model?.oosPnlPct ?? model?.oosPnl ?? null;
  }

  isRiskMissing(policy: MlPolicy): boolean {
    return policy.riskPerTrade === null || policy.riskPerTrade === undefined || Number(policy.riskPerTrade) <= 0;
  }

  isSchemaStale(model: MlServedModel | null): boolean {
    const newest = this.newestSchemaVersion;
    return Boolean(model && newest !== null && model.schemaVersion !== null && model.schemaVersion !== undefined && String(model.schemaVersion) !== String(newest));
  }

  rowWarnings(policy: MlPolicy): string[] {
    const served = this.servedFor(policy);
    const warnings: string[] = [];
    if (!served) warnings.push('No served model');
    if (this.isSchemaStale(served)) warnings.push('Schema differs from newest served model');
    if (this.isRiskMissing(policy)) warnings.push('Risk per trade is empty or zero');
    return warnings;
  }

  openRuns(policy: MlPolicy, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/ml/training-runs'], { queryParams: { mlPolicyId: policy.id } });
  }

  formatTs(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    const d = new Date(value > 9_999_999_999 ? value : value * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  private sortValue(policy: MlPolicy): number {
    const served = this.servedFor(policy);
    switch (this.sortKey) {
      case 'oosPnl':
        return this.oosPnl(served) ?? Number.NEGATIVE_INFINITY;
      case 'trainingRunCount':
        return policy.trainingRunCount ?? 0;
      case 'riskPerTrade':
        return policy.riskPerTrade ?? 0;
      case 'served':
        return served ? 1 : 0;
      case 'createdAt':
      default:
        return policy.createdAt ?? 0;
    }
  }
}
