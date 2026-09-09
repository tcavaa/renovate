/**
 * PM2 process definition.
 *
 * Runs the standalone server that `next build` emits (see `output: 'standalone'` in
 * next.config.mjs). `deploy/deploy.sh` points `current/` at the release to run and calls
 * `pm2 startOrReload ecosystem.config.cjs`, which restarts with zero downtime.
 *
 * Logs: the app writes structured JSON to stdout and to `logs/app-YYYY-MM-DD.log`; PM2
 * captures stdout/stderr into the two files below. Rotate them with `pm2 install pm2-logrotate`.
 */
module.exports = {
  apps: [
    {
      name: 'renovate-ge',
      cwd: __dirname,
      script: '.next/standalone/server.js',
      instances: 1, // the in-memory rate limiter assumes one process; use Redis before clustering
      exec_mode: 'fork',
      max_memory_restart: '600M',
      kill_timeout: 8000,
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',
        LOG_DIR: `${__dirname}/logs`,
      },
      out_file: `${__dirname}/logs/pm2-out.log`,
      error_file: `${__dirname}/logs/pm2-error.log`,
      merge_logs: true,
      time: true,
    },
  ],
};
