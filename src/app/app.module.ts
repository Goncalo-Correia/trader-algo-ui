import { ErrorHandler, NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AuthInterceptor } from './core/auth.interceptor';
import { ErrorInterceptor } from './core/error.interceptor';
import { GlobalErrorHandler } from './core/global-error-handler';
import { AppComponent } from './app.component';
import { ChartComponent } from './components/chart/chart.component';
import { HighchartsChartComponent } from './components/highcharts-chart/highcharts-chart.component';
import { BacktestChartComponent } from './components/backtest-chart/backtest-chart.component';
import { MultiChartComponent } from './components/multi-chart/multi-chart.component';
import { TradePanelComponent } from './components/trade-panel/trade-panel.component';
import { AlgoTraderPageComponent } from './pages/algo-trader/algo-trader.component';
import { ChartsPageComponent } from './pages/charts/charts-page.component';
import { AccountsPageComponent } from './pages/accounts/accounts-page.component';
import { AccountDetailComponent } from './pages/account-detail/account-detail.component';
import { BacktestPageComponent } from './pages/backtest/backtest-page.component';
import { BacktestsPageComponent } from './pages/backtests/backtests-page.component';
import { BacktestDetailComponent } from './pages/backtest-detail/backtest-detail.component';
import { TradeBotsPageComponent } from './pages/tradebots/tradebots-page.component';
import { TradebotDetailComponent } from './pages/tradebot-detail/tradebot-detail.component';
import { MlPoliciesPageComponent } from './pages/ml/ml-policies-page.component';
import { MlPolicyFormComponent } from './pages/ml/ml-policy-form.component';
import { MlPolicyDetailComponent } from './pages/ml/ml-policy-detail.component';
import { MlTrainingDetailComponent } from './pages/ml/ml-training-detail.component';

@NgModule({
  declarations: [
    AppComponent,
    ChartComponent,
    BacktestChartComponent,
    HighchartsChartComponent,
    MultiChartComponent,
    TradePanelComponent,
    AlgoTraderPageComponent,
    ChartsPageComponent,
    AccountsPageComponent,
    AccountDetailComponent,
    BacktestPageComponent,
    BacktestsPageComponent,
    BacktestDetailComponent,
    TradeBotsPageComponent,
    TradebotDetailComponent,
    MlPoliciesPageComponent,
    MlPolicyFormComponent,
    MlPolicyDetailComponent,
    MlTrainingDetailComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule,
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
