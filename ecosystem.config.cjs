module.exports = {
  apps: [
    {
      name: "api-delsol-chatbot",
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      node_args: "--no-deprecation",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
        PORT: 5400,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5401,
      },
    },
  ],
};
