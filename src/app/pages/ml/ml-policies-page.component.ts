import { Component, OnInit } from '@angular/core';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { MlPolicy } from '../../structures/ml-policy';

@Component({
  selector: 'app-ml-policies-page',
  templateUrl: './ml-policies-page.component.html',
  styleUrls: ['./ml-policies-page.component.css'],
})
export class MlPoliciesPageComponent implements OnInit {
  policies: MlPolicy[] = [];
  readonly trackById = (_: number, policy: MlPolicy): number => policy.id;
  isLoading = true;

  constructor(private readonly api: TraderAlgoApiService) {}

  ngOnInit(): void {
    this.api.getPolicies().subscribe({
      next: data => { this.policies = data; this.isLoading = false; },
      error: ()   => { this.isLoading = false; },
    });
  }

  formatTs(value: number | null): string {
    if (value === null) return '—';
    // CreatedAt may arrive as unix seconds or milliseconds depending on serialization.
    const d = new Date(value > 9_999_999_999 ? value : value * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }
}
