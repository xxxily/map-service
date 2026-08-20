const commonConfig = {
  instances: 1,
  exec_mode: 'fork',

  // Production updates are controlled by deploy-66.sh. File watching and
  // self-pulling can create duplicate restarts and mixed code/artifact states.
  watch: false,

  max_restarts: 15,
  restart_delay: 5000,
  exp_backoff_restart_delay: 100,
  kill_timeout: 10000,
  log_date_format: 'MM-DD HH:mm:ss',
  combine_logs: true,
  log_file: 'logs/pm2/combined.outerr.log',
  out_file: 'logs/pm2/out.log',
  error_file: 'logs/pm2/err.log',
  pid_file: 'logs/pm2/pid.log',

  // 66 has about 1.9 GiB RAM and no swap. Leave room for Caddy, PM2,
  // databases and the kernel instead of allowing Node to consume the host.
  node_args: '--max-old-space-size=640',
  max_memory_restart: '768M',

  force: false,
}

module.exports = {
  apps: [
    {
      name: 'map-service',
      cwd: __dirname,
      script: 'service/index.js',
      ...commonConfig,
    },
  ],
}
