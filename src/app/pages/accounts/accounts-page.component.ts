import { Component, OnInit } from '@angular/core';
import { TradingAccount, CreateTradingAccountRequest, TradingStrategy } from '../../structures/trading-account';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';

@Component({
  selector: 'app-accounts-page',
  templateUrl: './accounts-page.component.html',
  styleUrls: ['./accounts-page.component.css'],
})
export class AccountsPageComponent implements OnInit {
  accounts: TradingAccount[] = [];
  isLoading = true;
  showCreateForm = false;
  creating = false;

  newName           = '';
  newInitialBalance = 10000;
  newStrategy: TradingStrategy = 'Sma';
  readonly strategies: TradingStrategy[] = ['Sma', 'Rsi', 'Macd'];

  constructor(private readonly api: TraderAlgoApiService) {}

  ngOnInit(): void {
    this.api.getTradingAccounts().subscribe({
      next: accounts => { this.accounts = accounts; this.isLoading = false; },
      error: () => { this.isLoading = false; },
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
      name:            this.newName.trim(),
      initialBalance:  this.newInitialBalance,
      tradingStrategy: this.newStrategy,
    };
    this.api.createTradingAccount(payload).subscribe({
      next: account => {
        this.accounts = [...this.accounts, account];
        this.showCreateForm = false;
        this.newName           = '';
        this.newInitialBalance = 10000;
        this.newStrategy       = 'Sma';
        this.creating = false;
      },
      error: () => { this.creating = false; },
    });
  }
}
