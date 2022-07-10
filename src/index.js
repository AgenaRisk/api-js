/* eslint-disable no-return-await */
/* eslint-disable no-restricted-syntax */
import fetch from 'cross-fetch';

const config = {
  auth: {
    tokenUrl: 'https://keycloak.prod.agenarisk.com/realms/cloud/protocol/openid-connect/token',
    username: '',
    password: '',
    refreshInterval: 500,
    clientId: 'agenarisk-cloud',
    noGiveUp: false,
    debug: false,
  },

  api: {
    server: 'https://api.staging.agenarisk.com',
    pollInterval: 1000,
    pollMaxAttempts: 1000,
    debugResponse: false,
    debug: false,
  },
};

const init = (initConfig) => {
  if (!(typeof initConfig === 'object')) {
    return;
  }
  config.auth = { ...config.auth, ...initConfig.auth };
  config.api = { ...config.api, ...initConfig.api };
};

const auth = {
  accessToken: null,
  accessTokenExpiry: new Date().getTime(),
  refreshToken: null,
  refreshTokenExpiry: new Date().getTime(),
  refreshTimer: null,

  log: (message) => {
    if (!config.auth.debug) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log(message);
  },

  reset: () => {
    clearInterval(auth.refreshTimer);
    auth.accessToken = null;
    auth.accessTokenExpiry = new Date().getTime();
    auth.refreshToken = null;
    auth.refreshTokenExpiry = new Date().getTime();
    auth.refreshTimer = null;
  },

  sendRequest: async (params) => await fetch(config.auth.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  })
    .then(async (response) => {
      const tokenData = await response.json();
      auth.log(tokenData);
      if (tokenData.error) {
        if (!config.noGiveUp) {
          auth.reset();
        }
        return null;
      }
      return tokenData;
    })
    .catch((error) => {
      auth.log(error);
      if (!config.noGiveUp) {
        auth.reset();
      }
      return null;
    }),

  extractToken: (tokenData) => {
    auth.accessToken = tokenData.access_token;
    const tokenExpiry = new Date();
    tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokenData.expires_in);
    auth.accessTokenExpiry = tokenExpiry.getTime();

    auth.refreshToken = tokenData.refresh_token;
    const tokenRefreshExpiry = new Date();
    tokenRefreshExpiry.setSeconds(tokenRefreshExpiry.getSeconds() + tokenData.refresh_expires_in);
    auth.refreshTokenExpiry = tokenRefreshExpiry.getTime();
  },

  useCredentials: async () => {
    const tokenData = await auth.sendRequest({
      username: config.auth.username,
      password: config.auth.password,
      grant_type: 'password',
      client_id: config.auth.clientId,
    });
    if (!tokenData) {
      return;
    }
    auth.extractToken(tokenData);
  },

  useRefreshToken: async () => {
    if (auth.accessToken && new Date().getTime() <= auth.accessTokenExpiry) {
      // Token still valid
      return;
    }

    if (!auth.refreshToken || auth.refreshTokenExpiry <= new Date().getTime()) {
      // Refresh token missing ot expired
      auth.useCredentials();
      return;
    }

    const tokenData = await auth.sendRequest({
      client_id: config.auth.clientId,
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    });

    if (!tokenData) {
      return;
    }

    auth.extract(tokenData);
  },

  startAuth: () => {
    if (auth.refreshTimer !== null) {
      return;
    }
    if (!config.auth.username) {
      throw new Error('Need valid username and password');
    }
    auth.refreshTimer = 1; // Make sure only one instance of this command is executed
    auth.useCredentials();
    if (!auth.refreshToken) {
      auth.reset();
      return;
    }
    auth.refreshTimer = setInterval(() => {
      auth.refreshToken();
    }, config.auth.refreshInterval);
  },
};

export default {
  init,
  login: (authConfig) => {
    init({ auth: authConfig });
    auth.reset();
    auth.startAuth();
  },
  logout: () => {
    init({ auth: { username: '', password: '' } });
    auth.reset();
  },
  getAccessToken: () => ({
    accessToken: auth.accessToken,
    accessTokenExpiry: auth.accessTokenExpiry,
    refreshToken: auth.refreshToken,
    refreshTokenExpiry: auth.refreshTokenExpiry,
  }),
};
