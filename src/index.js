/**
 * Bot_HH_Habr — Точка входа
 *
 * Запускает polling-цикл с заданным интервалом.
 * Использует node-cron для планирования (или setInterval как fallback).
 */

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { runPollCycle } from './workers/poller.js';
import { initSheetHeaders } from './services/sheets.js';
import { sendAlert } from './services/telegram.js';

async function main() {
  logger.info('==========================================');
  logger.info('Bot_HH_Habr starting...');
  logger.info(`ENV: ${config.nodeEnv} | Poll interval: ${config.worker.pollIntervalMs / 1000}s`);
  logger.info('==========================================');

  // Инициализация Google Sheets (заголовки, если не созданы)
  try {
    await initSheetHeaders();
  } catch (err) {
    logger.warn(`Could not init Sheets headers: ${err.message}`);
  }

  // Первый запуск сразу при старте
  await runPollCycle().catch(err => {
    logger.error(`First poll cycle failed: ${err.message}`);
  });

  // Дальше по интервалу
  setInterval(async () => {
    try {
      await runPollCycle();
    } catch (err) {
      logger.error(`Poll cycle error: ${err.message}`);
    }
  }, config.worker.pollIntervalMs);

  logger.info(`Next poll in ${config.worker.pollIntervalMs / 1000} seconds`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received. Shutting down...');
    process.exit(0);
  });

  // Глобальный обработчик непойманных ошибок
  process.on('uncaughtException', async (err) => {
    logger.error(`Uncaught exception: ${err.message}`, err);
    await sendAlert(`Критическая ошибка бота:\n\`${err.message}\``).catch(() => {});
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
