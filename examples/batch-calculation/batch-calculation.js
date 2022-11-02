/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import agena from '../../src/index.js';

let model;
let dataSets;

try {
  // Resolving from project root
  model = JSON.parse(fs.readFileSync(path.resolve('./examples/batch-calculation/model.json'), 'utf8')).model;
  dataSets = agena.readCsv({
    network: 'Car Costs_0',
    data: fs.readFileSync(path.resolve('./examples/batch-calculation/data.csv'), 'utf8'),
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}

// console.log(JSON.stringify(dataSets, null, 2))

// You can use slice to calculate only a subset of datasets in the data file
// dataSets = dataSets.slice(1,10);

(async () => {
  agena.init({
    auth: {
      username: 'test@example.com',
      password: '1234567890',
    },
  });
  await agena.logIn();
  console.log('Logged in');

  const results = await agena.calculateBatch({
    model,
    dataSets,
  });

  try {
    console.log('Writing results');
    fs.writeFileSync(path.resolve('./examples/batch-calculation/output.json'), JSON.stringify(results));
  } catch (error) {
    console.log(error);
  }
  process.exit(0);
})();
