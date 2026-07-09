import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlPolicy } from '../../structures/ml-policy';
import { MlServedModel } from '../../structures/ml-training';

interface ServedRow {
  policy: MlPolicy;
  model: MlServedModel | null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-served-models-page',
  templateUrl: './ml-served-models-page.component.html',
  styleUrls: ['./ml-served-models-page.component.css'],
  imports: [RouterLink, DecimalPipe],
})
export class MlServedModelsPageComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  rows: ServedRow[] = [];
  isLoading = true;
  loadError: string | null = null;

  readonly trackByPolicyId = (_: number, row: ServedRow): number => row.policy.id;

  ngOnInit(): void {
    this.load();
  }

  get newestSchemaVersion(): string | number | null {
    const versions = this.rows
      .map(row => row.model?.schemaVersion)
      .filter(version => version !== null && version !== undefined)
      .map(String);
    return versions.length ? versions.sort().at(-1) ?? null : null;
  }

  load(): void {
    this.isLoading = true;
    this.loadError = null;
    forkJoin({
      policies: this.api.getPolicies(),
      served: this.api.getServedModels().pipe(catchError(() => of([] as MlServedModel[]))),
    }).subscribe({
      next: ({ policies, served }) => {
        this.rows = policies.map(policy => ({
          policy,
          model: served.find(model => this.policyId(model) === policy.id) ?? null,
        }));
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadError = 'Could not load served models.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  policyId(model: MlServedModel): number {
    return model.mlPolicyId ?? model.policyId ?? 0;
  }

  runId(model: MlServedModel | null): number | null {
    return model?.servedTrainingRunId ?? model?.trainingRunId ?? null;
  }

  isServed(model: MlServedModel | null): boolean {
    return model !== null && model.served !== false && this.runId(model) !== null;
  }

  isSchemaStale(model: MlServedModel | null): boolean {
    const newest = this.newestSchemaVersion;
    return Boolean(model && newest !== null && model.schemaVersion !== null && model.schemaVersion !== undefined && String(model.schemaVersion) !== String(newest));
  }

  oosPnl(model: MlServedModel | null): number | null {
    return model?.oosPnlPct ?? model?.oosPnl ?? null;
  }

  inSamplePnl(model: MlServedModel | null): number | null {
    return model?.inSamplePnlPct ?? model?.inSamplePnl ?? null;
  }

  oosBalance(model: MlServedModel | null): number | null {
    return model?.oosFinalBalance ?? null;
  }

  inSampleBalance(model: MlServedModel | null): number | null {
    return model?.inSampleFinalBalance ?? null;
  }

  tradeCount(model: MlServedModel | null): number | null {
    return model?.tradeCount ?? model?.nTrades ?? null;
  }

  pnlClass(value: number | null): string {
    if (value === null) return 'td-dim';
    return value >= 0 ? 'positive' : 'negative';
  }
}
