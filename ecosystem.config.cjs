module.exports = {
  apps: [
    {
      name: 'partnership-pipeline-api',
      cwd: './api',
      script: 'src/index.ts',
      interpreter: 'tsx',
      env: {
        PARTNERSHIP_PORT: '3003',
        PARTNERSHIP_HOST: '127.0.0.1',
      },
    },
  ],
};