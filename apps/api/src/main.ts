import { buildApp } from './app.js';

async function main() {
  const { app, env } = await buildApp();

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
    app.log.info(`OrbitQueue API running on http://localhost:${env.API_PORT}`);
    app.log.info(`API docs available at http://localhost:${env.API_PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
