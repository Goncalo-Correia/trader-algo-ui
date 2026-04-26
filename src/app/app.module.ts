import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LightweightChartComponent } from './components/lightweight-chart/lightweight-chart.component';
import { MultiChartComponent } from './components/multi-chart/multi-chart.component';

@NgModule({
  declarations: [
    AppComponent,
    LightweightChartComponent,
    MultiChartComponent,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
