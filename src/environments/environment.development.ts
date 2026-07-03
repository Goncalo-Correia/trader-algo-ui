// Development environment (used by `npm start` via angular.json file replacement).
//
// The backend URLs are the local defaults. The API key is NOT hardcoded here —
// this file is committed, and the key is a secret. It comes from the git-ignored
// generated config, which `scripts/generate-env.mjs` fills from your git-ignored
// .env.local.json (or the TRADER_ALGO_API_KEY env var). See README > Deployment.
import { generatedApiConfig } from './environment.generated';

export const environment = {
  production: false,
  traderAlgoApi: {
    baseUrl: 'http://localhost:32772',
    wsUrl: 'ws://localhost:32772',
    apiKey: generatedApiConfig.apiKey,
  },
};
