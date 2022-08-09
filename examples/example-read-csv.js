import fs from 'fs';
import path from 'path';
import agena from '../src/index.js';

let data;
try {
  // Resolving from project root
  data = fs.readFileSync(path.resolve('./examples/example-read-csv.csv'), 'utf8');
  const dataSets = agena.readCsv({
    network: 'New Risk Object0',
    data,
  });
  console.log(JSON.stringify(dataSets, null, 2));
} catch (err) {
  console.error(err);
  process.exit(1);
}
