module.exports = {
  apps: [
    {
      name: "book-api",
      cwd: "./apps/api",
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: "production",
        PORT: 5556
      }
    },
    {
      name: "book-worker",
      cwd: "./apps/api",
      script: "src/queues/book.worker.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "book-web",
      cwd: "./apps/web",
      script: "node_modules/.bin/next",
      args: "start",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: "production",
        PORT: 5555
      }
    }
  ]
};
