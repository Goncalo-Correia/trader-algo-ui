import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LightweightChartComponent } from './components/lightweight-chart/lightweight-chart.component';
import { MultiChartComponent } from './components/multi-chart/multi-chart.component';
import { TradePanelComponent } from './components/trade-panel/trade-panel.component';

@NgModule({
  declarations: [
    AppComponent,
    LightweightChartComponent,
    MultiChartComponent,
    TradePanelComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
