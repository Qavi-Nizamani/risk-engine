module.exports = {
  apps: [
    {
      name: "api-gateway",
      cwd: "./apps/api-gateway",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ingestion-service",
      cwd: "./apps/ingestion-service",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "worker-risk",
      cwd: "./apps/worker-risk",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "websocket-service",
      cwd: "./apps/websocket-service",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "web",
      cwd: "./apps/web",
      script: "node",
      args: "node_modules/next/dist/bin/next start -p 3000",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "developer",
      cwd: "./apps/developer",
      script: "node",
      args: "node_modules/next/dist/bin/next start -p 3001",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
