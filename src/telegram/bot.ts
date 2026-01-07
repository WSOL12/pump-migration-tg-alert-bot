import TelegramBot from 'node-telegram-bot-api';
import { Config } from '../utils/config';
import { MigrationTransaction, TokenData, AlertMessage } from '../types';

export class TelegramBotHandler {
  private bot: TelegramBot;
  private config: Config;
  private subscribedUsers: Set<number> = new Set();

  constructor(config: Config) {
    this.config = config;
    this.bot = new TelegramBot(config.telegramBotToken, { polling: true });
    
    // Initialize subscribed users from config
    config.userChatIds.forEach(id => {
      const chatId = parseInt(id);
      if (!isNaN(chatId)) {
        this.subscribedUsers.add(chatId);
      }
    });

    this.setupCommands();
  }

  private setupCommands(): void {
    // Handle /start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.subscribedUsers.add(chatId);
      this.bot.sendMessage(
        chatId,
        '🚀 Welcome to Pump.fun Migration Alert Bot!\n\n' +
        'You are now subscribed to receive migration alerts.\n\n' +
        'I will notify you whenever a token migrates on pump.fun!'
      );
    });

    // Handle /stop command
    this.bot.onText(/\/stop/, (msg) => {
      const chatId = msg.chat.id;
      this.subscribedUsers.delete(chatId);
      this.bot.sendMessage(
        chatId,
        'You have been unsubscribed from migration alerts.'
      );
    });

    // Handle /status command
    this.bot.onText(/\/status/, (msg) => {
      const chatId = msg.chat.id;
      const isSubscribed = this.subscribedUsers.has(chatId);
      this.bot.sendMessage(
        chatId,
        `Status: ${isSubscribed ? '✅ Subscribed' : '❌ Not subscribed'}\n\n` +
        `Use /start to subscribe or /stop to unsubscribe.`
      );
    });

    // Handle errors
    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error);
    });
  }

  async sendMigrationAlert(
    migration: MigrationTransaction,
    tokenData: TokenData
  ): Promise<void> {
    const message = this.formatAlertMessage(migration, tokenData);

    // Send to all subscribed users (text only, no chart image)
    const promises = Array.from(this.subscribedUsers).map(async (chatId) => {
      try {
        await this.bot.sendMessage(chatId, message.text, {
          parse_mode: 'HTML',
        });
      } catch (error) {
        console.error(`Error sending text message to user ${chatId}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log(`Migration alert sent to ${this.subscribedUsers.size} users`);
  }

  private formatAlertMessage(
    migration: MigrationTransaction,
    tokenData: TokenData
  ): AlertMessage {
    const text = `
🚀 <b>Pump.fun Migration Alert!</b>

📊 <b>Token:</b> ${tokenData.name} (${tokenData.symbol})
📍 <b>Contract:</b> <code>${migration.tokenMint}</code>

🔗 <a href="${migration.transactionUrl}">View Transaction on Solscan</a>

⏰ Migration detected at ${new Date(migration.timestamp).toLocaleString()}
    `.trim();

    return { text };
  }

  getSubscribedUsers(): number[] {
    return Array.from(this.subscribedUsers);
  }

  addUser(chatId: number): void {
    this.subscribedUsers.add(chatId);
  }

  removeUser(chatId: number): void {
    this.subscribedUsers.delete(chatId);
  }

  stopPolling(): void {
    this.bot.stopPolling();
  }
}



