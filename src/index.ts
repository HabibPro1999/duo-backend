import { buildServer } from '@core/server.js';
import { config } from '@config/app.config.js';
import { logger } from '@shared/utils/logger.js';
import { gracefulShutdown } from '@core/shutdown.js';

async function main() {
  const server = await buildServer();

  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(`Server running on port ${config.PORT}`);

  gracefulShutdown(server);
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
