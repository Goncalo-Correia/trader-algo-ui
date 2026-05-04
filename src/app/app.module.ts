import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ChartComponent } from './components/chart/chart.component';
import { HighchartsChartComponent } from './components/highcharts-chart/highcharts-chart.component';
import { BacktestChartComponent } from './components/backtest-chart/backtest-chart.component';
import { LightweightChartComponent } from './components/lightweight-chart/lightweight-chart.component';
import { MultiChartComponent } from './components/multi-chart/multi-chart.component';
import { TradePanelComponent } from './components/trade-panel/trade-panel.component';
import { AlgoTraderPageComponent } from './pages/algo-trader/algo-trader.component';
import { ChartsPageComponent } from './pages/charts/charts-page.component';
import { DeprecatedPageComponent } from './pages/deprecated/deprecated.component';
import { AccountsPageComponent } from './pages/accounts/accounts-page.component';
import { AccountDetailComponent } from './pages/account-detail/account-detail.component';
import { BacktestPageComponent } from './pages/backtest/backtest-page.component';
import { BacktestsPageComponent } from './pages/backtests/backtests-page.component';
import { BacktestDetailComponent } from './pages/backtest-detail/backtest-detail.component';
import { TradeBotsPageComponent } from './pages/tradebots/tradebots-page.component';
import { TradebotDetailComponent } from './pages/tradebot-detail/tradebot-detail.component';

@NgModule({
  declarations: [
    AppComponent,
    ChartComponent,
    BacktestChartComponent,
    HighchartsChartComponent,
    LightweightChartComponent,
    MultiChartComponent,
    TradePanelComponent,
    AlgoTraderPageComponent,
    ChartsPageComponent,
    DeprecatedPageComponent,
    AccountsPageComponent,
    AccountDetailComponent,
    BacktestPageComponent,
    BacktestsPageComponent,
    BacktestDetailComponent,
    TradeBotsPageComponent,
    TradebotDetailComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
