import { buildServer } from '@core/server.js';
import { config } from '@config/app.config.js';
import { logger } from '@shared/utils/logger.js';
import { gracefulShutdown } from '@core/shutdown.js';
import { processEmailQueue } from '@modules/email/index.js';

async function main() {
  const server = await buildServer();

  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(`Server running on port ${config.PORT}`);

  // Start email queue worker (processes every 60 seconds)
  setInterval(async () => {
    try {
      const result = await processEmailQueue(50);
      if (result.processed > 0) {
        logger.info({ result }, 'Email queue processed');
      }
    } catch (err) {
      logger.error({ err }, 'Email queue processing failed');
    }
  }, 60_000);
  logger.info('Email queue worker started (60s interval)');

  gracefulShutdown(server);
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
