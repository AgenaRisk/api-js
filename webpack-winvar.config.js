import path from 'path';

export default {
  entry: './src/index.js',
  output: {
    path: path.resolve('./dist'),
    filename: 'agena-api-winvar.js',
    library: {
      name: 'AgenaApi',
      type: 'assign',
    },
  },
  mode: 'production',
};
