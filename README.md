# Pump.fun Migration Telegram Alert Bot

A real-time Telegram bot that monitors the Solana blockchain for pump.fun token migrations and sends instant alerts to subscribed users. The bot tracks migration transactions, fetches token metadata, organic scores, and market data to provide comprehensive migration notifications.

## Features

- **Real-time Migration Detection**: Monitors Solana blockchain via Helius WebSocket for pump.fun migration transactions
- **Token Analytics**: Fetches organic scores, market cap, liquidity, and holder count from Jupiter API
- **Telegram Alerts**: Sends formatted alerts with token information and transaction links
- **Rate Limiting**: Built-in rate limiting to handle API requests efficiently
- **Auto-reconnect**: Automatic WebSocket reconnection with error handling
- **Comprehensive Data**: Includes token name, symbol, contract address, and market metrics

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Helius API key ([Get one here](https://www.helius.dev/))
- Telegram Bot Token ([Create a bot](https://t.me/botfather))
- Jupiter API key ([Get one here](https://station.jup.ag/))

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pump-migration-tg-alert-bot1
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
HELIUS_API_KEY=your_helius_api_key_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
JUPITER_API_KEY=your_jupiter_api_key_here
USER_CHAT_IDS=123456789,987654321
PUMP_FUN_PROGRAM_ID=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
PUMP_FUN_AMM_PROGRAM_ID=675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `HELIUS_API_KEY` | Your Helius API key for WebSocket connection | Yes |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from BotFather | Yes |
| `JUPITER_API_KEY` | Your Jupiter API key for token data | Yes |
| `USER_CHAT_IDS` | Comma-separated list of Telegram chat IDs to receive alerts | Optional |
| `PUMP_FUN_PROGRAM_ID` | Pump.fun program ID (default provided) | Optional |
| `PUMP_FUN_AMM_PROGRAM_ID` | Pump.fun AMM program ID (default provided) | Optional |

### Getting Your Telegram Chat ID

1. Start a conversation with your bot
2. Send `/start` command
3. The bot will automatically subscribe you to alerts
4. Alternatively, use [@userinfobot](https://t.me/userinfobot) to get your chat ID

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

1. Build the project:
```bash
npm run build
```

2. Start the bot:
```bash
npm start
```

### Watch Mode (for development)

```bash
npm run watch
```

## Telegram Commands

- `/start` - Subscribe to migration alerts
- `/stop` - Unsubscribe from migration alerts
- `/status` - Check your subscription status

## How It Works

1. **WebSocket Connection**: Connects to Helius WebSocket API to monitor pump.fun program logs
2. **Transaction Filtering**: Filters transactions for migration indicators ("Instruction: Migrate")
3. **Transaction Parsing**: Fetches full transaction details and extracts token mint address
4. **Data Enrichment**: Fetches token metadata and Jupiter organic score data
5. **Alert Generation**: Formats and sends alerts to all subscribed Telegram users

## Project Structure

```
pump-migration-tg-alert-bot1/
├── src/
│   ├── detectors/
│   │   └── migration.ts          # Migration detection logic
│   ├── fetchers/
│   │   └── tokenData.ts           # Token data fetching
│   ├── parsers/
│   │   └── transaction.ts         # Transaction parsing
│   ├── telegram/
│   │   └── bot.ts                 # Telegram bot handler
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   ├── utils/
│   │   └── config.ts              # Configuration loader
│   ├── websocket/
│   │   └── helius.ts              # Helius WebSocket client
│   └── index.ts                   # Main entry point
├── dist/                          # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Features in Detail

### Migration Detection

The bot specifically detects actual migration transactions by:
- Looking for "Instruction: Migrate" in transaction logs
- Excluding fee collection transactions (CollectCreatorFee, MigrateBondingCurveCreator)
- Extracting token mint addresses from transaction data

### Rate Limiting

- Implements a queue system for transaction processing
- Minimum 100ms interval between API requests (10 requests/second max)
- Handles rate limit errors gracefully with automatic retry

### Alert Format

Each alert includes:
- Token name and symbol
- Contract address (clickable)
- Organic score with label (High/Medium/Low)
- Market cap
- Liquidity
- Holder count
- Transaction link (Solscan)
- Detection timestamp

## Troubleshooting

### WebSocket Connection Issues

- **403 Forbidden**: Check your Helius API key and ensure WebSocket access is enabled
- **Connection Drops**: The bot automatically reconnects, but check your network stability
- **Subscription Errors**: Verify the pump.fun program ID is correct

### Telegram Bot Issues

- **Bot Not Responding**: Verify your bot token is correct and the bot is started
- **No Alerts Received**: Use `/start` command to subscribe, check `/status` to verify

### API Rate Limits

- The bot includes rate limiting, but if you hit limits:
  - Reduce the number of monitored programs
  - Increase the `minFetchInterval` in `src/index.ts`

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This bot is for informational purposes only. Always do your own research before making any trading decisions. The bot does not provide financial advice.
