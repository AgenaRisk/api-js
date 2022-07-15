/* eslint-disable no-console */
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
    debugLevel: 1,
  },
};

const init = (initConfig) => {
  if (!(typeof initConfig === 'object')) {
    return;
  }
  config.auth = { ...config.auth, ...initConfig.auth };
  config.api = { ...config.api, ...initConfig.api };
};

const functions = {
  delay: (ms, v) => new Promise((resolve) => {
    setTimeout(resolve.bind(null, v), ms);
  }),

  messageType: {
    Error: 'Error',
    Warning: 'Warning',
    Log: 'Log',
  },

  printLog: (message) => {
    if (!console) {
      return;
    }
    if (typeof console.log === 'function') {
      console.log(message);
    }
  },

  printWarning: (message) => {
    if (!console) {
      return;
    }
    if (typeof console.warn === 'function') {
      console.warn(message);
    } else {
      functions.printLog(message);
    }
  },

  printError: (message) => {
    if (!console) {
      return;
    }
    if (typeof console.error === 'function') {
      console.error(message);
    } else {
      functions.printWarning(message);
    }
  },

  log: (message, messageType = functions.messageType.Log) => {
    switch (messageType) {
      case functions.messageType.Error:
        functions.printError(message);
        break;

      case functions.messageType.Warning:
        functions.printWarning(message);
        break;

      case functions.messageType.Log:
      default:
        functions.printLog(message);
    }
  },
};

const auth = {
  accessToken: null,
  accessTokenExpiry: new Date().getTime(),
  refreshToken: null,
  refreshTokenExpiry: new Date().getTime(),
  refreshTimer: null,

  log: (message, messageType = functions.messageType.Log) => {
    if (!config.auth.debug) {
      return;
    }
    functions.log(message, messageType);
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
        if (!config.noGiveUp || auth.refreshTokenExpiry >= new Date().getTime()) {
          auth.reset();
        }
        functions.log(tokenData.error, functions.messageType.Error);
        return null;
      }
      return tokenData;
    })
    .catch((error) => {
      functions.log(error, functions.messageType.Error);
      if (!config.noGiveUp) {
        functions.log('Agena authentication: stopping refresh timer', functions.messageType.Warning);
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
  logIn: (authConfig) => {
    init({ auth: authConfig });
    auth.reset();
    auth.startAuth();
  },
  logOut: () => {
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
