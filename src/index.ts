import { buildServer } from '@core/server.js';
import { config } from '@config/app.config.js';
import { logger } from '@shared/utils/logger.js';
import { gracefulShutdown } from '@core/shutdown.js';
import { processEmailQueue } from '@modules/email/index.js';

async function main() {
  const server = await buildServer();

  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(`Server running on port ${config.PORT}`);

  // Start email queue worker (processes every 15 seconds for faster email delivery)
  setInterval(() => {
    processEmailQueue(50)
      .then((result) => {
        if (result.processed > 0) {
          logger.info({ result }, 'Email queue processed');
        }
      })
      .catch((err) => {
        logger.error({ err }, 'Email queue processing failed');
      });
  }, 15_000);
  logger.info('Email queue worker started (15s interval)');

  gracefulShutdown(server);
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
