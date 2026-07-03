import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TradingAccount, CreateTradingAccountRequest } from '../../structures/trading-account';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-accounts-page',
  templateUrl: './accounts-page.component.html',
  styleUrls: ['./accounts-page.component.css'],
  imports: [FormsModule, RouterLink, DecimalPipe],
})
export class AccountsPageComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);

  accounts: TradingAccount[] = [];
  readonly trackById = (_: number, account: TradingAccount): number => account.id;
  isLoading = true;
  showCreateForm = false;
  creating = false;

  newName = '';
  newInitialBalance = 10000;

  ngOnInit(): void {
    this.api.getTradingAccounts().subscribe({
      next: accounts => {
        this.accounts = accounts;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }

  getPnlAmount(account: TradingAccount): number {
    return account.currentBalance - account.initialBalance;
  }

  getPnlPercent(account: TradingAccount): number {
    if (account.initialBalance === 0) return 0;
    return ((account.currentBalance - account.initialBalance) / account.initialBalance) * 100;
  }

  createAccount(): void {
    if (!this.newName.trim()) return;
    this.creating = true;
    const payload: CreateTradingAccountRequest = {
      name: this.newName.trim(),
      initialBalance: this.newInitialBalance,
    };
    this.api.createTradingAccount(payload).subscribe({
      next: account => {
        this.accounts = [...this.accounts, account];
        this.showCreateForm = false;
        this.newName = '';
        this.newInitialBalance = 10000;
        this.creating = false;
      },
      error: () => {
        this.creating = false;
      },
    });
  }
}
