import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlPolicy } from '../../structures/ml-policy';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ml-policies-page',
  templateUrl: './ml-policies-page.component.html',
  styleUrls: ['./ml-policies-page.component.css'],
  imports: [RouterLink, DecimalPipe],
})
export class MlPoliciesPageComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  policies: MlPolicy[] = [];
  readonly trackById = (_: number, policy: MlPolicy): number => policy.id;
  isLoading = true;

  ngOnInit(): void {
    this.api.getPolicies().subscribe({
      next: data => {
        this.policies = data;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  formatTs(value: number | null): string {
    if (value === null) return '—';
    // CreatedAt may arrive as unix seconds or milliseconds depending on serialization.
    const d = new Date(value > 9_999_999_999 ? value : value * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }
}
