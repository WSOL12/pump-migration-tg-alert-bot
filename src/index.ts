import { loadConfig, Config } from './utils/config';
import { HeliusWebSocketClient } from './websocket/helius';
import { MigrationDetector } from './detectors/migration';
import { TransactionParser } from './parsers/transaction';
import { TokenDataFetcher } from './fetchers/tokenData';
import { TelegramBotHandler } from './telegram/bot';
import { HeliusWebSocketMessage } from './types';
import { Connection } from '@solana/web3.js';

async function main() {
  console.log('Starting Pump.fun Migration Telegram Alert Bot...');

  // Load configuration
  let config: Config;
  try {
    config = loadConfig();
    console.log('Configuration loaded successfully');
  } catch (error) {
    console.error('Failed to load configuration:', error);
    process.exit(1);
  }

  // Initialize components
  const tokenDataFetcher = new TokenDataFetcher();
  const transactionParser = new TransactionParser();
  const migrationDetector = new MigrationDetector(config);
  const telegramBot = new TelegramBotHandler(config);

  // Track processed transactions to avoid duplicates
  const processedSignatures = new Set<string>();
  
  // Rate limiting: track last fetch time and queue
  let lastFetchTime = 0;
  const minFetchInterval = 100; // Minimum 100ms between fetches (10 requests/second max)
  const pendingFetches: Array<{ signature: string; timestamp: number }> = [];
  let isProcessingQueue = false;

  // Helper function to check if logs indicate a potential migration
  function hasMigrationIndicators(logs: string[]): boolean {
    if (!logs || !Array.isArray(logs)) return false;
    const logText = logs.join(' ').toLowerCase();
    return logText.includes('migrate') || 
           logText.includes('migration') ||
           (logText.includes('burn') && logText.includes('lp')) ||
           logText.includes('pump.fun: migration');
  }

  // Process pending fetches with rate limiting
  async function processFetchQueue() {
    if (isProcessingQueue || pendingFetches.length === 0) {
      return;
    }

    isProcessingQueue = true;

    while (pendingFetches.length > 0) {
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTime;
      
      if (timeSinceLastFetch < minFetchInterval) {
        await new Promise(resolve => setTimeout(resolve, minFetchInterval - timeSinceLastFetch));
      }

      const item = pendingFetches.shift();
      if (!item) break;

      // Skip if too old (older than 30 seconds)
      if (now - item.timestamp > 30000) {
        continue;
      }

      lastFetchTime = Date.now();
      await fetchAndProcessTransaction(item.signature);
    }

    isProcessingQueue = false;
  }

  // Fetch and process a single transaction
  async function fetchAndProcessTransaction(signature: string) {
    try {
      // Avoid processing the same transaction twice
      if (processedSignatures.has(signature)) {
        return;
      }

      // Fetch the full transaction to check if it's a migration
      const connection = new Connection(
        `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`,
        'confirmed'
      );

      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });

      if (!tx) {
        return; // Transaction not found, skip silently
      }

      // Check if this is a migration transaction
      const detection = migrationDetector.detectMigrationFromTransaction(tx, signature);

      if (!detection.isMigration) {
        return; // Not a migration, skip silently
      }

      // Migration detected! Now display logs
      processedSignatures.add(signature);
      console.log('\n🚀 ========================================');
      console.log('🚀 MIGRATION DETECTED!');
      console.log('🚀 ========================================');
      console.log(`📋 Transaction Signature: ${signature}`);
      console.log(`📋 Instructions: ${tx.transaction.message.instructions.length}`);
      console.log(`📋 Logs count: ${tx.meta?.logMessages?.length || 0}`);
      
      if (tx.meta?.logMessages && tx.meta.logMessages.length > 0) {
        console.log('\n📋 Transaction Logs:');
        tx.meta.logMessages.forEach((log, index) => {
          console.log(`   [${index + 1}] ${log}`);
        });
      }

      // Parse transaction details
      const migration = await transactionParser.parseMigrationTransactionFromParsed(
        tx,
        detection.tokenMint,
        signature
      );

      if (!migration || !migration.tokenMint) {
        console.warn('⚠️  Could not parse migration transaction');
        console.log('========================================\n');
        return;
      }

      console.log(`\n💰 Token Mint: ${migration.tokenMint}`);

      // Fetch token data
      const tokenData = await tokenDataFetcher.fetchTokenData(migration.tokenMint);

      if (!tokenData) {
        console.warn(`⚠️  Could not fetch token data for ${migration.tokenMint}`);
        console.log('📤 Sending alert with basic info...');
        // Still send alert with basic info
        await telegramBot.sendMigrationAlert(migration, {
          mint: migration.tokenMint,
          name: 'Unknown Token',
          symbol: 'UNKNOWN',
          decimals: 9,
        });
        console.log('✅ Alert sent!');
        console.log('========================================\n');
        return;
      }

      // Update migration with token info
      migration.tokenName = tokenData.name;
      migration.tokenSymbol = tokenData.symbol;

      console.log(`📊 Token: ${tokenData.name} (${tokenData.symbol})`);
      console.log(`📤 Sending alert...`);
      console.log('========================================\n');

      // Send Telegram alert
      await telegramBot.sendMigrationAlert(migration, tokenData);

      // Clean up old processed signatures (keep last 1000)
      if (processedSignatures.size > 1000) {
        const signaturesArray = Array.from(processedSignatures);
        const toRemove = signaturesArray.slice(0, signaturesArray.length - 1000);
        toRemove.forEach(sig => processedSignatures.delete(sig));
      }
    } catch (error: any) {
      // Handle rate limiting errors gracefully
      if (error?.message?.includes('429') || error?.message?.includes('Too Many Requests')) {
        // Re-add to queue with delay (silently)
        setTimeout(() => {
          if (!processedSignatures.has(signature)) {
            pendingFetches.push({ signature, timestamp: Date.now() });
            processFetchQueue();
          }
        }, 2000);
        return;
      }
      // Only log errors for detected migrations
      if (processedSignatures.has(signature)) {
        console.error('❌ Error processing migration transaction:', error);
      }
    }
  }

  // Initialize WebSocket client
  const wsClient = new HeliusWebSocketClient(config, async (message: HeliusWebSocketMessage) => {
    try {
      // Handle log notifications - extract transaction signature
      let signature: string | undefined;
      let logs: string[] = [];
      
      if (message.method === 'logsNotification') {
        // Extract signature and logs from log notification
        const result = (message.params?.result as any);
        
        if (result?.value?.signature) {
          signature = result.value.signature;
          logs = result.value.logs || [];
        } else if (result?.signature) {
          signature = result.signature;
          logs = result.logs || [];
        } else {
          // Logs notification structure may vary, try alternative paths
          const value = result?.value || result;
          signature = value?.signature;
          logs = value?.logs || [];
        }
      } else if (message.params?.result?.transaction) {
        // Handle full transaction notification
        const tx = message.params.result.transaction;
        signature = tx.transaction?.signatures?.[0];
      }

      if (!signature) {
        return; // No signature found, skip silently
      }

      // Pre-filter: Only queue transactions that might be migrations based on logs
      if (logs.length > 0) {
        const hasIndicators = hasMigrationIndicators(logs);
        if (!hasIndicators) {
          return; // Skip silently if no migration indicators
        }
      }

      // Add to queue for processing with rate limiting
      pendingFetches.push({ signature, timestamp: Date.now() });
      
      // Process queue if not already processing
      processFetchQueue();
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
    }
  });

  // Connect to WebSocket
  wsClient.connect();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    wsClient.disconnect();
    telegramBot.stopPolling();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    wsClient.disconnect();
    telegramBot.stopPolling();
    process.exit(0);
  });

  // Keep process alive
  console.log('Bot is running. Press Ctrl+C to stop.');
}

// Start the bot
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});



