import { createRequire } from 'module';
import agena from '../../src/index.js';

const require = createRequire(import.meta.url);
const { model } = require('./model');
const credentials = require('./.local/credentials');
const data = require('./data');

(async () => {
  await agena.logIn({
    username: credentials.username,
    password: credentials.password,
  });

  const response = await agena.calculate({
    model,
    observations: data,
  });

  const totalCost = (response.results || []).find((result) => result.node === 'total_cost');

  if (totalCost) {
    console.log(`Total annual cost estimate: ${totalCost.summaryStatistics.mean}`);
  } else {
    console.log(response.messages);
  }

  console.log('Full response:');
  console.log(JSON.stringify(response, null, 2));

  process.exit();
})();
