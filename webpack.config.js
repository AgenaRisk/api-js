import path from 'path';

export default {
  entry: './src/index.js',
  output: {
    path: path.resolve('./dist'),
    filename: 'agena-api.js',
    library: {
    //   name: 'agena',
      type: 'module',
    },
    // library: 'agena',
    // libraryExport: 'default',
  },
  experiments: {
    outputModule: true,
  },
  mode: 'production',
};
