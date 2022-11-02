/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import agena from '../../src/index.js';

/**
 * This example will read model and data from file,
 * and use a result cache file to determine, which datasets are not yet processed,
 * and will only process yet uncalculated datasets.
 * It will pass a callback to the batch calculator so every dataset result is written to cache individually as soon as calculated.
 *
 * Once all datasets were calculated, the cache is parsed into an array of JSON objects and written into the results file.
 *
 * If required, it the cache file can be read as array of lines, and each line can be parsed as JSON object
 * to reconstruct an array of currently calculated results.
 */

const resultCacheFile = path.resolve('./examples/batch-with-callback/output.txt');
const modelFile = path.resolve('./examples/batch-with-callback/model.json');
const dataFile = path.resolve('./examples/batch-with-callback/data.csv');
const outputFile = path.resolve('./examples/batch-with-callback/results.json');

let model;
let inputDatasets;

try {
  // Resolving from project root
  model = JSON.parse(fs.readFileSync(modelFile, 'utf8')).model;
  inputDatasets = agena.readCsv({
    network: 'Car Costs_0',
    data: fs.readFileSync(dataFile, 'utf8'),
  });
} catch (error) {
  console.error('Failed to load model or data', error.message);
  process.exit(1);
}

let outputContents = '';
try {
  outputContents = fs.readFileSync(resultCacheFile, 'utf8');
} catch (error) {
  console.log('No results cached', error.message);
}
const outputDatasets = outputContents ? outputContents.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line)) : [];

// const inputDsIds = inputDatasets.map((ds) => ds.id);
const outputDsIds = outputDatasets.map((ds) => ds.id);
if (outputDsIds.length > 0) {
  console.log('Cached results: ', outputDsIds.length);
}
// const idsToCalculate = inputDsIds.filter((id) => !outputDsIds.includes(id));

(async () => {
  agena.init({
    auth: {
      username: 'test@example.com',
      password: '1234567890',
    },
  });
  await agena.logIn();
  console.log('Logged in');

  await agena.calculateBatch({
    model,
    dataSets: inputDatasets.filter((ds) => !outputDsIds.includes(ds.id)),
    dataSetCallback: async (dsCalculated) => {
      outputDsIds.push(dsCalculated.id);
      fs.appendFile(resultCacheFile, `${JSON.stringify(dsCalculated)}\n`, (error) => {
        if (error) {
          console.log('Failed to write results to cache', error.message);
        }
      });
    },
  });

  try {
    console.log('Writing results');
    const results = fs.readFileSync(resultCacheFile, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
      // If you want results also sorted by ID then add sort stage here
      // .sort((a, b) => a.id.localeCompare(b.id)) // If you have String IDs
      // .sort((a, b) => Number.parseInt(a.id, 10) - Number.parseInt(b.id, 10)) // If have integer IDs

    fs.writeFileSync(outputFile, JSON.stringify(results));
  } catch (error) {
    console.log('Failed to write results', error.message);
    process.exit(1);
  }

  process.exit(0);
})();
