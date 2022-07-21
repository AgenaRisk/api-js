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
    refreshPreemptBy: 5000,
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

/**
 * Configures the library by overwriting existing fields with the ones provided; can be done multiple times with different parameters for additive effect
 *
 * @param {Object} initConfig
 * Supported fields are:
 * * auth.username
 * * auth.password
 * * auth.refreshInterval - how often to check if the accessToken needs refreshing; default: 500 ms
 * * auth.refreshPreemptBy - will attempt to refresh if accessToken expiry > this value plus new Date().getTime(); default: 5000 ms
 * * auth.noGiveUp: ignore errors during refreshing and keep trying; default: false
 * * auth.debug: will print additional messages to console global object; default: false
 *
 * * api.server: root url of the API server; default: https://api.staging.agenarisk.com
 * * api.pollInterval: interval between polling attempts; default: 1000 ms
 * * api.pollMaxAttempts: max attempts for polling after which the function gives up and returns an error; default: 1000
 * * api.debugResponse: will include original response (before JSON conversion) in the field debugResponse (except for connection errors); default: false
 * * api.debug: print additional messages to console; default: false
 * * api.debugLevel: threshold level of messages to be printed, 10 = all, 1 = minimum; default: 1
 */
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
        functions.log(tokenData.error_description || tokenData.error, functions.messageType.Error);
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
    if (auth.accessToken && new Date().getTime() + config.auth.refreshPreemptBy <= auth.accessTokenExpiry) {
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

    auth.extractToken(tokenData);
  },

  startAuth: async () => {
    if (auth.refreshTimer !== null) {
      return;
    }
    if (!config.auth.username) {
      throw new Error('Need valid username and password');
    }
    auth.refreshTimer = 1; // Make sure only one instance of this command is executed
    await auth.useCredentials();
    if (!auth.refreshToken) {
      auth.reset();
      return;
    }
    auth.refreshTimer = setInterval(() => {
      auth.useRefreshToken();
    }, config.auth.refreshInterval);
  },

};

const api = {
  log: ({ message, messageType = functions.messageType.Log, debugLevel = 1 }) => {
    if (!config.api.debug || debugLevel > config.api.debugLevel) {
      return;
    }
    functions.log(message, messageType);
  },

  sendRequest: async ({
    method = 'POST',
    body = '',
    bearerToken,
    url,
    params,
    headers,
  }) => {
    let queryString = '';
    if (params) {
      queryString = (url.indexOf('?') > 0) ? '&' : `?${new URLSearchParams(params).toString()}`;
    }
    const requestUrl = url + queryString;

    let effectiveHeaders;

    if (headers) {
      effectiveHeaders = headers;
    } else {
      effectiveHeaders = {
        'Content-Type': 'text/plain; charset=utf-8',
      };
      if (bearerToken) {
        effectiveHeaders.Authorization = `Bearer ${bearerToken}`;
      } else if (auth.accessToken) {
        effectiveHeaders.Authorization = `Bearer ${auth.accessToken}`;
      }
    }

    api.log({ message: `Sending ${method} request to: ${requestUrl}` });
    api.log({ message: 'Effective headers:', debugLevel: 5 });
    api.log({ message: effectiveHeaders, debugLevel: 5 });
    if (body) {
      api.log({ message: 'Request body:', debugLevel: 5 });
      api.log({ message: body, debugLevel: 5 });
    }

    return await fetch(requestUrl, {
      method,
      headers: effectiveHeaders,
      ...(body && { body }),
      cache: 'no-cache',
      redirect: 'follow',
    })
      .then(async (response) => {
        let json = {};
        try {
          json = await response.json();
        } catch (error) {
          // Not a valid JSON
          api.log({ message: response });
          return {
            status: 'error',
            code: response.status,
            messages: [response.statusText],
            ...(config.api.debugResponse && { debugResponse: response }),
            message: response.statusText,
          };
        }

        if (json.error) {
          return {
            status: 'error',
            code: response.status,
            messages: [response.statusText],
            ...(config.api.debugResponse && { debugResponse: response }),
            message: response.statusText,
          };
        }

        return {
          ...json,
          code: response.status,
          ...(config.api.debugResponse && { debugResponse: response }),
        };
      })
      .catch((error) => ({ // Connection error
        status: 'error',
        messages: [error.message || error],
        message: error.message || error,
      }));
  },

  createDataset: ({
    id = 'Scenario 1',
    observations = [],
  }) => ({
    id,
    displayable: true,
    active: true,
    observations: observations.map((obsSummary) => {
      if (!obsSummary.node || !obsSummary.network || (!obsSummary.entries && obsSummary.entry)) {
        api.log('Observations must specify node, network and entry/entries', functions.messageType.Error);
        return undefined;
      }
      let entries;
      if (obsSummary.entries) {
        entries = [...obsSummary.entries];
      } else {
        entries = [{
          value: obsSummary.entry,
          weight: 1,
        }];
      }

      const observation = {
        network: obsSummary.network,
        node: obsSummary.node,
        entries,
      };

      return observation;
    }).filter((obs) => obs !== undefined),
  }),

  /**
   * Async calculation function
   * * Either returns a cloud API response according to https://agenarisk.atlassian.net/wiki/spaces/PROTO/pages/785711115 section Response
   * * Or an object with status = error, message and messages array (in case there could be multiple messages)
   *
   * @param {string} server - API server root; default: https://api.staging.agenarisk.com
   * @param {function} resolveBearerToken - function to dynamically resolve accessToken valid at the time of the original or some future polling request; default: agena.getAccessToken().accessToken
   * @param {object} model - Object representing the model; will override body
   * @param {string} appId - ID of the cloud App that holds the model to calculate - can be used instead of supplying the actual model
   * @param {array} observations - Array of observations, where each observation has: network (string ID), node (string ID) and entry (string value);
   *  or is formatted according to https://agenarisk.atlassian.net/wiki/spaces/PROTO/pages/785711115 section Common Elements: Data Set
   * @param {boolean} syncWait - Whether to wait on the first request before falling back to polling; optional; default: true
   *
   * @returns calculation job response Object or error object
   */
  calculate: async ({
    server = config.api.server,
    resolveBearerToken,
    model,
    observations,
    syncWait = true,
    body = {},
    appId,
  }) => {
    const effectiveBody = {
      ...body,
      ...(typeof model === 'object' && { model }),
      ...(syncWait && { 'sync-wait': syncWait }),
      ...(appId && { appId }),
      ...(observations && { dataSet: api.createDataset(observations) }),
    };

    const originalResponse = await api.sendRequest({
      url: `${server.trim().replace(/\/+$/, '')}/public/calculate`,
      ...(typeof resolveBearerToken === 'function' && { bearerToken: resolveBearerToken() }),
      body: JSON.stringify(effectiveBody),
    });

    if (originalResponse.code === 202 && originalResponse.pollingUrl) {
      // Pending or processing, polling is required
      let attempt = 0;
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await functions.delay(config.api.pollInterval);
        api.log({ message: `Polling attempt ${attempt}: ${originalResponse.pollingUrl}` });
        // eslint-disable-next-line no-await-in-loop
        const pollResponse = await api.sendRequest({
          method: 'GET',
          url: originalResponse.pollingUrl,
          ...(typeof resolveBearerToken === 'function' && { bearerToken: resolveBearerToken() }),
        });

        if (pollResponse.code !== 202) {
          // Job completed
          return pollResponse;
        }

        attempt += 1;
        if (config.api.pollMaxAttempts > 0 && attempt > config.api.pollMaxAttempts) {
          return {
            ...pollResponse,
            status: 'error',
            messages: [`Maximum polling attempts (${config.api.pollMaxAttempts}) reached`, ...((pollResponse.messages && pollResponse.messages.length) ? [pollResponse.messages] : [])],
          };
        }
      }
    } else {
      api.log({ message: 'Original request resolved' });
      return originalResponse;
    }
  },
};

export default {
  init,

  /**
   * Unless initialised prior to this call, include object with username and password fields
   *
   * @param {Object} authConfig optional override to auth config
   */
  logIn: async (authConfig) => {
    init({ auth: authConfig });
    auth.reset();
    await auth.startAuth();
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
  calculate: api.calculate,
};
