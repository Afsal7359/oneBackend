/**
 * PM2 process config for oneBackend.
 *
 *   pm2 start ecosystem.config.cjs      # start gateway + all 5 services
 *   pm2 save && pm2 startup             # survive server reboots
 *   pm2 logs / pm2 restart all / pm2 status
 *
 * In production only the GATEWAY port needs to be reachable from outside
 * (nginx proxies 443 -> 4000). The five service ports stay on localhost.
 */

const path = require('path');
const svc = (name) => path.join(__dirname, 'services', name);

// Restart policy shared by every process.
//
// Keep `instances: 1` / `exec_mode: 'fork'`. Each service caches public GET
// responses in its own memory and clears them when a model is written, which is
// only correct while one process owns both the cache and the writes. Under
// cluster mode a write handled by worker A would leave workers B/C serving the
// old response until the TTL expired. Scaling out needs a shared invalidation
// channel (Redis pub/sub) in utils/responseCache.js first — see the note there.
const common = {
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  max_restarts: 10,
  min_uptime: '20s',
  max_memory_restart: '400M',
  env: { NODE_ENV: 'production' },
  time: true, // timestamp log lines
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'gateway',
      cwd: __dirname,
      script: 'gateway.js',
    },
    {
      ...common,
      name: 'aligaah',
      cwd: svc('aligaah'),
      script: 'server.js',
    },
    {
      ...common,
      name: 'crunz',
      cwd: svc('crunz'),
      script: 'server.js',
    },
    {
      ...common,
      name: 'ezone',
      cwd: svc('ezone'),
      script: 'server.js',
    },
    {
      ...common,
      name: 'underdwag',
      cwd: svc('underdwag'),
      script: 'src/server.js',
    },
    {
      ...common,
      name: 'isosmack',
      cwd: svc('isosmack'),
      script: 'src/server.js',
    },
  ],
};
