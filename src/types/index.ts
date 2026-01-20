export interface MigrationTransaction {
  signature: string;
  tokenMint: string;
  tokenName?: string;
  tokenSymbol?: string;
  timestamp: number;
  liquidityPool?: string;
  solAmount?: number;
  transactionUrl: string;
}

export interface TokenData {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  price?: number;
  marketCap?: number;
  liquidity?: number;
  logoUrl?: string;
}

export interface AlertMessage {
  text: string;
  chartImage?: Buffer;
}

export interface HeliusWebSocketMessage {
  jsonrpc: string;
  method?: string;
  params?: {
    result?: {
      transaction?: {
        transaction?: {
          signatures?: string[];
          message?: {
            accountKeys?: string[];
            instructions?: any[];
          };
        };
        meta?: {
          logMessages?: string[];
          preBalances?: number[];
          postBalances?: number[];
        };
      };
      slot?: number;
      value?: {
        signature?: string;
        logs?: string[];
      };
    };
    subscription?: number;
  };
  id?: number;
}







