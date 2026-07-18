// Serverless entry for Vercel — loads compiled Nest app from dist/
// Nest CLI emits to dist/src when rootDir/nest structure nests src
const path = require('path');
const fs = require('fs');

function loadBootstrap() {
  const candidates = [
    path.join(__dirname, '../dist/src/bootstrap'),
    path.join(__dirname, '../dist/bootstrap'),
  ];
  for (const c of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(c);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new Error(
    `Cannot find bootstrap. Looked in: ${candidates.join(', ')}. dist listing: ${
      fs.existsSync(path.join(__dirname, '../dist'))
        ? fs.readdirSync(path.join(__dirname, '../dist')).join(',')
        : 'missing'
    }`,
  );
}

const { getExpressApp } = loadBootstrap();

let appPromise;

module.exports = async function handler(req, res) {
  if (!appPromise) {
    appPromise = getExpressApp();
  }
  const app = await appPromise;
  return app(req, res);
};
