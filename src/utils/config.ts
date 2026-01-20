import * as dotenv from 'dotenv';

dotenv.config();

export interface Config {
  heliusApiKey: string;
  telegramBotToken: string;
  pumpFunProgramId: string;
  pumpFunAmmProgramId: string;
  userChatIds: string[];
  jupiterApiKey: string;
}

export function loadConfig(): Config {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const pumpFunProgramId = process.env.PUMP_FUN_PROGRAM_ID || '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
  const pumpFunAmmProgramId = process.env.PUMP_FUN_AMM_PROGRAM_ID || '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
  const userChatIdsEnv = process.env.USER_CHAT_IDS || '';
  const jupiterApiKey = process.env.JUPITER_API_KEY;

  if (!heliusApiKey || heliusApiKey.includes('your_') || heliusApiKey.includes('here')) {
    throw new Error(
      'HELIUS_API_KEY is required. Please set it in your .env file.\n' +
      'Get your API key from: https://www.helius.dev/'
    );
  }

  if (!telegramBotToken || telegramBotToken.includes('your_') || telegramBotToken.includes('here')) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is required. Please set it in your .env file.\n' +
      'Create a bot at: https://t.me/botfather'
    );
  }

  if (!jupiterApiKey || jupiterApiKey.includes('your_') || jupiterApiKey.includes('here')) {
    throw new Error(
      'JUPITER_API_KEY is required. Please set it in your .env file.\n' +
      'Get your API key from: https://station.jup.ag/'
    );
  }

  const userChatIds = userChatIdsEnv
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  return {
    heliusApiKey,
    telegramBotToken,
    pumpFunProgramId,
    pumpFunAmmProgramId,
    userChatIds,
    jupiterApiKey,
  };
}







