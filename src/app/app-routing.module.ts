import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AlgoTraderPageComponent } from './pages/algo-trader/algo-trader.component';
import { ChartsPageComponent } from './pages/charts/charts-page.component';
import { DeprecatedPageComponent } from './pages/deprecated/deprecated.component';
import { AccountsPageComponent } from './pages/accounts/accounts-page.component';
import { AccountDetailComponent } from './pages/account-detail/account-detail.component';

const routes: Routes = [
  { path: 'algo-trader',    component: AlgoTraderPageComponent },
  { path: 'charts',         component: ChartsPageComponent },
  { path: 'accounts',       component: AccountsPageComponent },
  { path: 'accounts/:id',   component: AccountDetailComponent },
  { path: 'deprecated',     component: DeprecatedPageComponent },
  { path: '',               redirectTo: '/charts', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
