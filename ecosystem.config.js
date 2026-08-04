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
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: "production",
        PORT: 5555
      }
    },
    {
      name: "chatbot-api",
      cwd: "./apps/chatbot",
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: "production",
        PORT: 5557
      }
    },
    {
      name: "chatbot-worker",
      cwd: "./apps/chatbot",
      script: "src/queues/message.worker.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "chatbot-ingest-worker",
      cwd: "./apps/chatbot",
      script: "src/queues/ingest.worker.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "chatbot-embed",
      cwd: "./apps/embedding-svc",
      script: "server.py",
      interpreter: "python3",
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        PORT: 5558
      }
    }
  ]
};
