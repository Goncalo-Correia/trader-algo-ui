import { Routes } from '@angular/router';

// Every page is lazy-loaded so the initial bundle only carries the shell.
export const routes: Routes = [
  {
    path: 'algo-trader',
    loadComponent: () => import('./pages/algo-trader/algo-trader.component').then(m => m.AlgoTraderPageComponent),
  },
  {
    path: 'charts',
    loadComponent: () => import('./pages/charts/charts-page.component').then(m => m.ChartsPageComponent),
  },
  {
    path: 'accounts',
    loadComponent: () => import('./pages/accounts/accounts-page.component').then(m => m.AccountsPageComponent),
  },
  {
    path: 'accounts/:id',
    loadComponent: () => import('./pages/account-detail/account-detail.component').then(m => m.AccountDetailComponent),
  },
  {
    path: 'backtest',
    loadComponent: () => import('./pages/backtest/backtest-page.component').then(m => m.BacktestPageComponent),
  },
  {
    path: 'backtests',
    loadComponent: () => import('./pages/backtests/backtests-page.component').then(m => m.BacktestsPageComponent),
  },
  {
    path: 'backtests/:id',
    loadComponent: () => import('./pages/backtest-detail/backtest-detail.component').then(m => m.BacktestDetailComponent),
  },
  {
    path: 'tradebots',
    loadComponent: () => import('./pages/tradebots/tradebots-page.component').then(m => m.TradeBotsPageComponent),
  },
  {
    path: 'tradebots/:id',
    loadComponent: () => import('./pages/tradebot-detail/tradebot-detail.component').then(m => m.TradebotDetailComponent),
  },
  {
    path: 'ml',
    pathMatch: 'full',
    redirectTo: 'ml/policies',
  },
  {
    path: 'ml/policies',
    loadComponent: () => import('./pages/ml/ml-policies-page.component').then(m => m.MlPoliciesPageComponent),
  },
  {
    path: 'ml/policies/new',
    loadComponent: () => import('./pages/ml/ml-policy-form.component').then(m => m.MlPolicyFormComponent),
  },
  {
    path: 'ml/policies/:id/edit',
    loadComponent: () => import('./pages/ml/ml-policy-form.component').then(m => m.MlPolicyFormComponent),
  },
  {
    path: 'ml/policies/:id',
    loadComponent: () => import('./pages/ml/ml-policy-detail.component').then(m => m.MlPolicyDetailComponent),
  },
  {
    path: 'ml/training-runs',
    loadComponent: () => import('./pages/ml/ml-training-runs-page.component').then(m => m.MlTrainingRunsPageComponent),
  },
  {
    path: 'ml/training-runs/:id',
    loadComponent: () => import('./pages/ml/ml-training-detail.component').then(m => m.MlTrainingDetailComponent),
  },
  {
    path: 'ml/runs/:id',
    loadComponent: () => import('./pages/ml/ml-training-detail.component').then(m => m.MlTrainingDetailComponent),
  },
  {
    path: 'ml/served-models',
    loadComponent: () => import('./pages/ml/ml-served-models-page.component').then(m => m.MlServedModelsPageComponent),
  },
  {
    path: 'ml/retrain-all',
    loadComponent: () => import('./pages/ml/ml-retrain-all-page.component').then(m => m.MlRetrainAllPageComponent),
  },
  { path: '', redirectTo: '/charts', pathMatch: 'full' },
];
