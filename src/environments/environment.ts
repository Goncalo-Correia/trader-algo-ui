// Production environment.
//
// The deployed build talks to whatever origin is serving it, upgrading to
// `wss://` automatically when the page is served over HTTPS. This avoids
// shipping a hardcoded `http://localhost` URL in a production bundle.
//
// To point the build at a fixed backend instead, replace the derived values
// below with explicit URLs (e.g. 'https://api.example.com').
const { protocol, host } = window.location;
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

export const environment = {
  production: true,
  traderAlgoApi: {
    baseUrl: `${protocol}//${host}`,
    wsUrl: `${wsProtocol}//${host}`,
  },
};
