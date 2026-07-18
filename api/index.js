const path = require('path');
const fs = require('fs');

function loadBootstrap() {
  // Nest may emit to dist/ or dist/src/ depending on config
  const candidates = [
    path.join(__dirname, '../dist/bootstrap'),
    path.join(__dirname, '../dist/src/bootstrap'),
  ];
  const errors = [];
  for (const c of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(c);
    } catch (e) {
      errors.push(`${c}: ${e && e.message ? e.message : e}`);
    }
  }
  const distRoot = path.join(__dirname, '../dist');
  const listing = fs.existsSync(distRoot)
    ? fs.readdirSync(distRoot).join(',')
    : 'missing';
  throw new Error(
    `Cannot load bootstrap. tried=[${errors.join(' | ')}] dist=[${listing}]`,
  );
}

let appPromise;

module.exports = async function handler(req, res) {
  try {
    if (!appPromise) {
      const { getExpressApp } = loadBootstrap();
      appPromise = getExpressApp().catch((err) => {
        appPromise = undefined;
        throw err;
      });
    }
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    const message = err && err.stack ? err.stack : String(err);
    // eslint-disable-next-line no-console
    console.error('Vercel handler error:', message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: {
            code: 'BOOTSTRAP_FAILED',
            message: err && err.message ? err.message : String(err),
          },
        }),
      );
    }
  }
};
