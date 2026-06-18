import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AlgoTraderPageComponent } from './pages/algo-trader/algo-trader.component';
import { ChartsPageComponent } from './pages/charts/charts-page.component';
import { AccountsPageComponent } from './pages/accounts/accounts-page.component';
import { AccountDetailComponent } from './pages/account-detail/account-detail.component';
import { BacktestPageComponent } from './pages/backtest/backtest-page.component';
import { BacktestsPageComponent } from './pages/backtests/backtests-page.component';
import { BacktestDetailComponent } from './pages/backtest-detail/backtest-detail.component';
import { TradeBotsPageComponent } from './pages/tradebots/tradebots-page.component';
import { TradebotDetailComponent } from './pages/tradebot-detail/tradebot-detail.component';
import { MlPageComponent } from './pages/ml/ml-page.component';
import { MlTrainPageComponent } from './pages/ml/ml-train-page.component';
import { MlTrainingDetailComponent } from './pages/ml/ml-training-detail.component';

const routes: Routes = [
  { path: 'algo-trader',    component: AlgoTraderPageComponent },
  { path: 'charts',         component: ChartsPageComponent },
  { path: 'accounts',       component: AccountsPageComponent },
  { path: 'accounts/:id',   component: AccountDetailComponent },
  { path: 'backtest',       component: BacktestPageComponent },
  { path: 'backtests',      component: BacktestsPageComponent },
  { path: 'backtests/:id',  component: BacktestDetailComponent },
  { path: 'tradebots',      component: TradeBotsPageComponent },
  { path: 'tradebots/:id',  component: TradebotDetailComponent },
  { path: 'ml',             component: MlPageComponent },
  { path: 'ml/new',         component: MlTrainPageComponent },
  { path: 'ml/:id',         component: MlTrainingDetailComponent },
  { path: '',               redirectTo: '/charts', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
