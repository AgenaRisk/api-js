/* eslint-disable no-console */
/* eslint-disable no-return-await */
/* eslint-disable no-restricted-syntax */
import fetch from 'cross-fetch';

const config = {
  auth: {
    tokenUrl: 'https://auth.agena.ai/realms/cloud/protocol/openid-connect/token',
    username: '',
    password: '',
    refreshInterval: 500,
    refreshPreemptBy: 5000,
    clientId: 'agenarisk-cloud',
    noGiveUp: false,
    debug: false,
  },

  api: {
    server: 'https://api.agena.ai',
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
 * * api.server: root url of the API server; default: https://api.agena.ai
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
  sleep: (ms, v) => new Promise((resolve) => {
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
      console.log(new Date().toISOString(), message);
    }
  },

  printWarning: (message) => {
    if (!console) {
      return;
    }
    if (typeof console.warn === 'function') {
      console.warn(new Date().toISOString(), message);
    } else {
      functions.printLog(message);
    }
  },

  printError: (message) => {
    if (!console) {
      return;
    }
    if (typeof console.error === 'function') {
      console.error(new Date().toISOString(), message);
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

  getDuration: (totalSeconds) => {
    let secs = totalSeconds;
    const hours = Math.floor(secs / 3600);
    secs %= 3600;
    const minutes = Math.floor(secs / 60);
    const seconds = (secs % 60).toFixed(3);
    return `${hours} hours, ${minutes} minutes, ${seconds} seconds`;
  },

  randBetween: (min, max) => Math.floor(Math.random() * (max - min + 1) + min),

  filterHeaders: (headers) => Object.fromEntries(Object.entries(headers).filter(([key]) => [
    'x-referer',
    'user-id',
  ].includes(`${key}`.toLowerCase()))),
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
    headers = {},
  }) => {
    let queryString = '';
    if (params) {
      queryString = (url.indexOf('?') > 0) ? '&' : `?${new URLSearchParams(params).toString()}`;
    }
    const requestUrl = url + queryString;

    const effectiveHeaders = {
      'Content-Type': 'text/plain; charset=utf-8',
      ...headers,
    };

    if (bearerToken) {
      effectiveHeaders.Authorization = `Bearer ${bearerToken}`;
    } else if (auth.accessToken) {
      effectiveHeaders.Authorization = `Bearer ${auth.accessToken}`;
    }

    api.log({ message: `Sending ${method} request to: ${requestUrl}`, debugLevel: 5 });
    api.log({ message: 'Effective headers:', debugLevel: 8 });
    api.log({ message: effectiveHeaders, debugLevel: 8 });
    if (body) {
      api.log({ message: 'Request body:', debugLevel: 9 });
      api.log({ message: body, debugLevel: 9 });
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
      if (!obsSummary.node || !obsSummary.network || !(obsSummary.entries || obsSummary.entry)) {
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
   * @param {string} server - API server root; default: api.config.server
   * @param {function} resolveBearerToken - function to dynamically resolve accessToken valid at the time of the original or some future polling request; default: agena.getAccessToken().accessToken
   * @param {object} model - Object representing the model
   * @param {string} modelPath - Local path of the model on the server
   * @param {string} appId - ID of the cloud App that holds the model to calculate - can be used instead of supplying the actual model
   * @param {array} observations - Array of observations, where each observation has: network (string ID), node (string ID) and entry (string value);
   *  or is formatted according to https://agenarisk.atlassian.net/wiki/spaces/PROTO/pages/785711115 section Common Elements: Data Set
   * @param {object} dataSet - Alternative to observations, must contain: observations array and id string and
   * is formatted according to https://agenarisk.atlassian.net/wiki/spaces/PROTO/pages/785711115 section Common Elements: Data Set
   * @param {boolean} syncWait - Whether to wait on the first request before falling back to polling; optional; default: true
   * @param {number} pollInterval - interval between polling attempts; default: config.api.pollInterval
   * @param {number} isInterrupted - optional callback to execute after each polling attempt; polling will be interupted if this returns true
   * @param {object} headers - Object custom headers to send along with the calculation request, only a specific headers are allowed
   *
   * @returns calculation job response Object or error object
   */
  calculate: async ({
    server = config.api.server,
    resolveBearerToken,
    model,
    modelPath,
    observations,
    dataSet,
    syncWait = true,
    body = {},
    appId,
    pollInterval = config.api.pollInterval,
    isInterrupted,
    headers = {},
  }) => {
    const effectiveBody = {
      ...body,
      ...(typeof model === 'object' && { model }),
      ...(syncWait && { 'sync-wait': syncWait }),
      ...(appId && { appId }),
      ...(modelPath && { modelPath }),
      ...(observations && !dataSet && { dataSet: api.createDataset({ observations }) }),
      ...(dataSet && !observations && { dataSet }),
    };

    if (typeof isInterrupted === 'function' && isInterrupted()) {
      return {
        status: 'error',
        messages: ['Aborted by requester'],
      };
    }

    const originalResponse = await api.sendRequest({
      url: `${server.trim().replace(/\/+$/, '')}/public/v1/calculate`,
      ...(typeof resolveBearerToken === 'function' && { bearerToken: resolveBearerToken() }),
      body: JSON.stringify(effectiveBody),
      headers: functions.filterHeaders(headers),
    });

    if (originalResponse.code === 202 && originalResponse.pollingUrl) {
      // Pending or processing, polling is required
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await functions.sleep(pollInterval);
        api.log({ message: `Polling attempt ${attempt}: ${originalResponse.pollingUrl}`, debugLevel: 7 });
        // eslint-disable-next-line no-await-in-loop
        const pollResponse = await api.sendRequest({
          method: 'GET',
          url: originalResponse.pollingUrl,
          ...(typeof resolveBearerToken === 'function' && { bearerToken: resolveBearerToken() }),
        });
        api.log({ message: pollResponse, debugLevel: 11 });

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

        console.log('after polling: ', isInterrupted, '//', typeof isInterrupted, '//', typeof isInterrupted === 'function' && isInterrupted());
        if (typeof isInterrupted === 'function' && isInterrupted()) {
          break;
        }
      }
    }

    api.log({ message: 'Original request response returned' });
    return originalResponse;
  },

  /**
   * @param {*} data CSV data (either string content of CSV file or array of string lines) with header row;
   *  This assumes your observations are in a single network, if you use multiple networks with observations, do not use this function;
   *  First column is expected to be dataset ID; second column will be assumed to be network ID unless network is also passed to this function.
   *
   * @param {string} network ID of the network; if missing will use second column
   *
   * @param {string} separator column separator in data; default: ,
   *
   * @returns array of dataset objects each
   */
  readCsv: ({ data, network, separator = ',' }) => {
    let rowsData;
    if (typeof data === 'string') {
      rowsData = data.trim().split(/\r?\n/);
    } else {
      rowsData = data;
    }

    const headerRowFields = rowsData[0].split(separator);
    const headers = headerRowFields.map((field) => {
      const parts = field.split(/ ?= ?/);
      const virtual = parts.length > 1;
      return {
        virtual,
        node: parts[0].trim(),
        state: `${parts[1]}`.trim(),
      };
    });

    const dataSets = rowsData.slice(1).map((rowData) => {
      const fields = rowData.split(/ ?, ?/).map((rawField) => rawField.replace(/^ *" */, '').replace(/ *" *$/, ''));

      const observationMap = {};

      // eslint-disable-next-line no-loop-func
      fields.forEach((field, j) => {
        if (j === 0) {
          // Data set ID
          return;
        }

        if (!network && j === 1) {
          // Network ID
          return;
        }

        if (field === '') {
          // Empty value
          return;
        }

        const header = headers[j];
        if (!observationMap[header.node]) {
          observationMap[header.node] = {
            network: network || fields[1],
            node: header.node,
            entries: [],
          };
        }

        if (header.virtual) {
          const weight = parseFloat(field);
          observationMap[header.node].entries.push({
            value: header.state,
            weight,
          });
        } else {
          observationMap[header.node].entries.push({
            value: field,
            weight: 1,
          });
        }
      });

      const dataSet = {
        id: fields[0],
        observations: Object.values(observationMap),
      };

      return dataSet;
    });

    return dataSets;
  },

  /**
   * Calculates a batch of datasets and returns an array of calculated dataset objects each with a results array
   *
   * @param {string} server - API server root; default: api.config.server
   * @param {function} resolveBearerToken - function to dynamically resolve accessToken valid at the time of the original or some future polling request; default: agena.getAccessToken().accessToken
   * @param {object} model - Object representing the model
   * @param {string} modelPath - Local path of the model on the server
   * @param {string} appId - ID of the cloud App that holds the model to calculate - can be used instead of supplying the actual model
   * @param {array} dataSets - Array of dataset objects formatted according to https://agenarisk.atlassian.net/wiki/spaces/PROTO/pages/785711115 section Common Elements: Data Set
   * @param {function} dataSetCallback - Optional function f(x) to be called after a dataset is calculated, where x is the calculated dataset object
   * @param {array} errorsArray - Optional array to add error messages to
   * @param {number} isInterrupted - optional callback to execute after each polling attempt; polling will be interupted if this returns true
   * @param {object} headers - Object custom headers to send along with the calculation request, only a specific headers are allowed
   * @param {object} rawResponses - Optional object to map raw responses for each individual dataset calculation
   *
   * @returns array of calculated dataset objects
   */
  calculateBatch: async ({
    server = config.api.server,
    resolveBearerToken,
    model,
    modelPath,
    appId,
    dataSets,
    dataSetCallback,
    errorsArray,
    isInterrupted,
    headers = {},
    rawResponses,
  }) => {
    api.log({ message: `Calculating a batch of: ${dataSets.length} datasets`, debugLevel: 4 });

    const startTime = new Date().getTime();

    const responses = [];
    const results = [];

    let completedJobs = 0;
    let completedTime = 0;
    let longestCalculationTime = Number.MIN_VALUE;
    let shortestCalculationTime = Number.MAX_VALUE;
    let averageCalculationTime = 0;
    let averageRecentWaitTime = 0;
    let jobsToSchedule = 1;
    let totalWaste = 0;

    const calculateAverageRecentWaitTime = (window = 4) => {
      const waitTimes = responses
        .slice(-window)
        .map((response) => Number.parseInt(response.duration.turnaround, 10) - Number.parseInt(response.duration.calculation, 10))
        .filter((time) => !Number.isNaN(time) && Number.isFinite(time));
      return Math.ceil(waitTimes.reduce((sum, el) => sum + el, 0) / waitTimes.length);
    };

    const updateCounters = (response) => {
      completedJobs += 1;
      completedTime += Number.parseInt(response.duration.calculation, 10);
      averageCalculationTime = Math.ceil(completedTime / completedJobs);
      averageRecentWaitTime = calculateAverageRecentWaitTime();
      longestCalculationTime = Math.max(longestCalculationTime, response.duration.calculation);
      shortestCalculationTime = Math.min(shortestCalculationTime, response.duration.calculation);
      if (averageRecentWaitTime > 500 && averageRecentWaitTime >= averageCalculationTime) {
        jobsToSchedule = Math.max(1, jobsToSchedule - 1);
      } else {
        // jobsToSchedule = Math.min(4, jobsToSchedule + 1);
        jobsToSchedule += 1;
      }
      // console.log(`completedJobs: ${completedJobs}; jobsToSchedule: ${jobsToSchedule}`);
    };

    let dsIndex = 0;
    let dssToRun = [];
    api.log({
      message: [
        '',
        'i',
        'Batch',
        'Dataset',
        'Calc_ms', // Calculation on the server
        'Turn_ms', // Turnaround time on the server
        'Wasted', // Time between job completion and retrieval
        'Polling',
        'Avg_clc', // Average calculation after completing this job
        'Avg_w8', // Average wait after completing this job
        'NBS', // Next batch size
        'T_calc', // Total calculation time on the server
        'T_dur', // Total duration (batch durations)
      ].join('\t'),
      debugLevel: 4,
    });

    let batchCounter = 0;

    do {
      dssToRun = dataSets.slice(dsIndex, dsIndex + jobsToSchedule);
      if (dssToRun.length === 0) {
        // console.log(`Empty queue at index ${dsIndex} of ${jobsToSchedule} in ${dataSets.length}`);
        break;
      }

      api.log({ message: `Scheduling: ${dssToRun.length} datasets from index ${dsIndex}`, debugLevel: 5 });

      // eslint-disable-next-line no-await-in-loop, no-loop-func
      await Promise.all(dssToRun.map(async (dataSet, i) => {
        const jobStartTime = new Date().getTime();
        const pollInterval = Math.ceil(Math.max(1000, 1000 + (averageCalculationTime + averageRecentWaitTime) / 4));
        // const pollInterval = 1000 + functions.randBetween(1000, 5000);
        api.log({ message: `Sending calculate request for Dataset ${dataSet.id} with pollingInterval: ${pollInterval}`, debugLevel: 5 });
        const response = await api.calculate({
          server, resolveBearerToken, model, modelPath, appId, dataSet, syncWait: true, pollInterval, isInterrupted, headers,
        });
        responses.push(response);
        if (rawResponses) {
          // eslint-disable-next-line no-param-reassign
          rawResponses[dataSet.id] = response;
        }
        // eslint-disable-next-line no-param-reassign
        dataSet.done = true;
        if (!response.results) {
          functions.log(`Dataset ${dataSet.id} ${(typeof isInterrupted === 'function' && isInterrupted()) ? ' aborted by requester' : 'failed to calculate'}:`, functions.messageType.Error);
          functions.log(response.messages, functions.messageType.Error);
          if (Array.isArray(errorsArray)) {
            errorsArray.push(`Dataset ${dataSet.id} calculation aborted`);
            errorsArray.push(...response.messages);
          }
        } else {
          const jobEndTime = new Date().getTime();
          updateCounters(response);
          const waste = jobEndTime - jobStartTime - response.duration.turnaround;
          totalWaste += waste;
          if (config.api.debug) {
            const message = [
              '',
              i + dsIndex,
              batchCounter,
              dataSet.id,
              response.duration.calculation,
              response.duration.turnaround,
              waste,
              pollInterval,
              averageCalculationTime,
              averageRecentWaitTime,
              jobsToSchedule,
              completedTime,
              new Date().getTime() - startTime,
            ].join('\t');
            api.log({ message, debugLevel: 4 });
          }

          const calculatedDs = {
            id: dataSet.id,
            results: response.results,
          };

          results.push(calculatedDs);

          if (typeof dataSetCallback === 'function') {
            dataSetCallback(calculatedDs);
          }
        }
      }));
      batchCounter += 1;
      dsIndex += dssToRun.length;
    } while (dssToRun.length > 0);

    const endTime = new Date().getTime();

    api.log({ message: 'Batch calculation finished', debugLevel: 2 });
    api.log({ message: `Datasets: ${dataSets.length}`, debugLevel: 2 });
    api.log({ message: `Total time: ${functions.getDuration((endTime - startTime) / 1000)}`, debugLevel: 2 });
    api.log({ message: `Total waste: ${totalWaste} ms`, debugLevel: 2 });
    api.log({ message: `Average calculate time: ${averageCalculationTime.toFixed(2)} ms`, debugLevel: 2 });
    api.log({ message: `Longest calculate time: ${longestCalculationTime} ms`, debugLevel: 2 });
    api.log({ message: `Shortest calculate time: ${shortestCalculationTime} ms`, debugLevel: 2 });

    return results;
  },

};

export default {
  init,

  /**
   * Unless initialised prior to this call, include object with username and password fields
   *
   * @param {object} authConfig optional override to auth config
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
  calculateBatch: api.calculateBatch,
  createDataset: api.createDataset,
  readCsv: api.readCsv,
};
