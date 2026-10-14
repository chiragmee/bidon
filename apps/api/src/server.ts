import { createApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
createApp(env).listen(env.PORT, () => {
  console.log(`AuctionIT API listening on :${env.PORT} (mode: ${env.DATA_MODE})`);
});
