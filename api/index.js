// Serverless entry for Vercel — loads compiled Nest app from dist/
const { getExpressApp } = require('../dist/bootstrap');

let appPromise;

module.exports = async function handler(req, res) {
  if (!appPromise) {
    appPromise = getExpressApp();
  }
  const app = await appPromise;
  return app(req, res);
};
