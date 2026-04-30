import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ChartComponent } from './components/chart/chart.component';
import { LightweightChartComponent } from './components/lightweight-chart/lightweight-chart.component';
import { MultiChartComponent } from './components/multi-chart/multi-chart.component';
import { TradePanelComponent } from './components/trade-panel/trade-panel.component';
import { AlgoTraderPageComponent } from './pages/algo-trader/algo-trader.component';
import { ChartsPageComponent } from './pages/charts/charts-page.component';
import { DeprecatedPageComponent } from './pages/deprecated/deprecated.component';
import { AccountsPageComponent } from './pages/accounts/accounts-page.component';
import { AccountDetailComponent } from './pages/account-detail/account-detail.component';

@NgModule({
  declarations: [
    AppComponent,
    ChartComponent,
    LightweightChartComponent,
    MultiChartComponent,
    TradePanelComponent,
    AlgoTraderPageComponent,
    ChartsPageComponent,
    DeprecatedPageComponent,
    AccountsPageComponent,
    AccountDetailComponent,
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
