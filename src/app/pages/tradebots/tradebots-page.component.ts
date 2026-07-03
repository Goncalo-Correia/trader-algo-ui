import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { TradeBot } from '../../structures/trade-bot';
import { RouterLink } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tradebots-page',
  templateUrl: './tradebots-page.component.html',
  styleUrls: ['./tradebots-page.component.css'],
  imports: [RouterLink],
})
export class TradeBotsPageComponent implements OnInit {
  private readonly api = inject(TraderAlgoApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  bots: TradeBot[] = [];
  readonly trackById = (_: number, bot: TradeBot): number => bot.id;
  isLoading = true;
  togglingId: number | null = null;

  ngOnInit(): void {
    this.loadBots();
  }

  toggleBot(bot: TradeBot, event: Event): void {
    event.stopPropagation();
    if (this.togglingId !== null) return;
    this.togglingId = bot.id;
    const action = bot.isEnabled ? this.api.disableTradeBot(bot.id) : this.api.enableTradeBot(bot.id);
    action.subscribe({
      next: updated => {
        const idx = this.bots.findIndex(b => b.id === updated.id);
        if (idx >= 0) this.bots = [...this.bots.slice(0, idx), updated, ...this.bots.slice(idx + 1)];
        this.togglingId = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.togglingId = null;
        this.cdr.markForCheck();
      },
    });
  }

  statusClass(bot: TradeBot): string {
    return bot.isEnabled ? 'status-enabled' : 'status-disabled';
  }

  scopeLabel(bot: TradeBot): string {
    if (bot.tradingAccountId !== null) {
      return bot.tradingAccountName ?? `Account #${bot.tradingAccountId}`;
    }
    if (bot.backtestId !== null) return `Backtest #${bot.backtestId}`;
    return 'Unscoped';
  }

  scopeClass(bot: TradeBot): string {
    if (bot.tradingAccountId !== null) return 'scope-account';
    if (bot.backtestId !== null) return 'scope-backtest';
    return 'scope-unknown';
  }

  formatTs(ts: number | string | null): string {
    if (!ts) return '—';
    const ms = typeof ts === 'number' ? (ts > 9_999_999_999 ? ts : ts * 1000) : Number(ts);
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  formatSignal(ts: number | string | null): string {
    if (!ts) return 'Never';
    const ms = typeof ts === 'number' ? (ts > 9_999_999_999 ? ts : ts * 1000) : Number(ts);
    const d = new Date(ms);
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    );
  }

  private loadBots(): void {
    this.api.getTradeBots().subscribe({
      next: bots => {
        this.bots = bots;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
