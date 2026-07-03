// Production environment.
//
// Backend URLs are resolved at build time from env vars (see
// scripts/generate-env.mjs). This is how the Vercel deployment points the app
// at the separately deployed backend: set TRADER_ALGO_API_BASE_URL (and
// optionally TRADER_ALGO_API_WS_URL) in the Vercel project settings.
//
// When no env var is set, we fall back to the origin serving the app, upgrading
// to `wss://` over HTTPS — so a same-origin deployment works with no config and
// no hardcoded `http://localhost` ever ships in a production bundle.
import { generatedApiConfig } from './environment.generated';

const { protocol, host } = window.location;
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

const baseUrl = generatedApiConfig.baseUrl || `${protocol}//${host}`;
const wsUrl =
  generatedApiConfig.wsUrl ||
  (generatedApiConfig.baseUrl
    ? generatedApiConfig.baseUrl.replace(/^http/, 'ws')
    : `${wsProtocol}//${host}`);

export const environment = {
  production: true,
  traderAlgoApi: {
    baseUrl,
    wsUrl,
    // Sent as the `X-Api-Key` header (REST) and `apiKey` query param (WebSocket).
    // Supplied at build time via the TRADER_ALGO_API_KEY env var on Vercel.
    apiKey: generatedApiConfig.apiKey,
  },
};
