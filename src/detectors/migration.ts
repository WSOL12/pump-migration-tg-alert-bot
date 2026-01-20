import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { Config } from '../utils/config';

export interface MigrationDetectionResult {
  isMigration: boolean;
  tokenMint?: string;
  signature?: string;
}

export interface JupiterTokenData {
  id: string;
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
  organicScore?: number;
  organicScoreLabel?: string;
  mcap?: number;
  fdv?: number;
  usdPrice?: number;
  liquidity?: number;
  holderCount?: number;
  stats24h?: {
    priceChange?: number;
    holderChange?: number;
    liquidityChange?: number;
    volumeChange?: number;
    buyVolume?: number;
    sellVolume?: number;
    buyOrganicVolume?: number;
    sellOrganicVolume?: number;
    numBuys?: number;
    numSells?: number;
    numTraders?: number;
    numOrganicBuyers?: number;
    numNetBuyers?: number;
  };
  audit?: {
    isSus?: boolean;
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
    devBalancePercentage?: number;
    devMigrations?: number;
  };
}

export class MigrationDetector {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  detectMigrationFromTransaction(tx: ParsedTransactionWithMeta, signature: string): MigrationDetectionResult {
    if (!tx || !tx.meta || tx.meta.err) {
      return { isMigration: false };
    }

    const instructions = tx.transaction.message.instructions || [];
    const logMessages = tx.meta.logMessages || [];

    // Check for migration indicators
    // Only detect actual migrations with "Instruction: Migrate", not fee collection transactions
    const hasMigrateInstruction = this.hasMigrateInstruction(instructions, logMessages);
    
    // Exclude fee collection transactions - they should not be detected as migrations
    const hasCollectFee = logMessages.some(log => 
      log.includes('Instruction: CollectCreatorFee') ||
      log.includes('Instruction: MigrateBondingCurveCreator') ||
      log.includes('Instruction: DistributeCreatorFees')
    );

    // Only detect if we have the actual migrate instruction AND it's not a fee collection
    const isMigration = hasMigrateInstruction && !hasCollectFee;

    if (!isMigration) {
      return { isMigration: false };
    }

    // Extract token mint from instructions or account keys
    const tokenMint = this.extractTokenMint(tx.transaction, instructions);

    return {
      isMigration: true,
      tokenMint,
      signature,
    };
  }

  private hasMigrateInstruction(instructions: any[], logMessages: string[]): boolean {
    // Check log messages for the specific "Instruction: Migrate" log
    // This is the actual migration instruction, not CollectCreatorFee or MigrateBondingCurveCreator
    const hasMigrateLog = logMessages.some(log => 
      log.includes('Instruction: Migrate')
    );

    if (hasMigrateLog) {
      return true;
    }

    // Check instructions for migrate program ID
    return instructions.some(ix => {
      const programId = ix.programId || ix.program;
      return programId === this.config.pumpFunProgramId && 
             (ix.data?.includes('migrate') || ix.parsed?.type === 'migrate');
    });
  }

  private hasPoolCreation(instructions: any[], logMessages: string[]): boolean {
    // Check for pool creation on Pump.fun AMM
    const poolCreationLogs = logMessages.filter(log =>
      log.toLowerCase().includes('create pool') ||
      log.toLowerCase().includes('createpool') ||
      log.toLowerCase().includes('pump.fun amm') ||
      log.toLowerCase().includes('pumpswap')
    );

    if (poolCreationLogs.length > 0) {
      return true;
    }

    // Check instructions for AMM program (even though we're not subscribing to it, 
    // migration transactions may include it)
    return instructions.some(ix => {
      const programId = ix.programId || ix.program;
      return programId === this.config.pumpFunAmmProgramId;
    });
  }

  private hasLpTokenBurn(logMessages: string[]): boolean {
    // Check for LP token burn logs
    return logMessages.some(log => {
      const lowerLog = log.toLowerCase();
      return (lowerLog.includes('burn') && lowerLog.includes('lp')) ||
             (lowerLog.includes('burn') && lowerLog.includes('token'));
    });
  }

  private hasMigrationTransfer(logMessages: string[]): boolean {
    // Check for transfers to migration address
    return logMessages.some(log => {
      const lowerLog = log.toLowerCase();
      return lowerLog.includes('pump.fun: migration') ||
             lowerLog.includes('migration');
    });
  }

  private extractTokenMint(tx: any, instructions: any[]): string | undefined {
    const accountKeys = tx?.message?.accountKeys || [];
    const accountKeysArray = accountKeys.map((key: any) => 
      typeof key === 'string' ? key : key.pubkey?.toString() || key.toString()
    );

    // For pump.fun migrations, the bonding curve address (which is the token mint) 
    // typically ends with "pump" and is usually in the first few account keys
    // Look for addresses ending with "pump" first
    for (const account of accountKeysArray) {
      if (typeof account === 'string' && account.endsWith('pump') && account.length === 44) {
        return account;
      }
    }

    // Try to extract token mint from instructions
    for (const ix of instructions) {
      if (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') {
        const mint = ix.parsed?.info?.mint || ix.parsed?.info?.tokenMint;
        if (mint) {
          return mint;
        }
      }

      // Check for mint in account keys
      if (ix.parsed?.info?.mint) {
        return ix.parsed.info.mint;
      }

      // Check accounts array in instruction for pump addresses
      if ('accounts' in ix && Array.isArray(ix.accounts)) {
        for (const accountIndex of ix.accounts) {
          const index = typeof accountIndex === 'number' ? accountIndex : parseInt(accountIndex.toString());
          if (index >= 0 && index < accountKeysArray.length) {
            const account = accountKeysArray[index];
            if (typeof account === 'string' && account.endsWith('pump') && account.length === 44) {
              return account;
            }
          }
        }
      }
    }

    // Fallback: look for valid Solana addresses in account keys (but prioritize pump addresses)
    for (const account of accountKeysArray) {
      if (typeof account === 'string' && account.length === 44) {
        // Skip system program and known program addresses
        if (account === '11111111111111111111111111111111' || 
            account === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
            account === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' ||
            account === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' ||
            account === this.config.pumpFunProgramId ||
            account === this.config.pumpFunAmmProgramId) {
          continue;
        }
        // Return first valid-looking address that's not a known program
        return account;
      }
    }

    return undefined;
  }

  /**
   * Fetches token organic score from Jupiter API
   * @param tokenMint The token mint address
   * @returns Promise with Jupiter token data including organic score, or null if not found
   */
  async fetchTokenOrganicScore(tokenMint: string): Promise<JupiterTokenData | null> {
    try {
      const options = {
        method: 'GET',
        headers: {
          'x-api-key': this.config.jupiterApiKey
        }
      };

      const url = `https://api.jup.ag/tokens/v2/search?query=${tokenMint}`;
      const response = await fetch(url, options);

      if (!response.ok) {
        if (response.status === 400 || response.status === 500) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          const errorMessage = (errorData && typeof errorData === 'object' && 'error' in errorData) 
            ? errorData.error 
            : response.statusText;
          console.warn(`⚠️  Jupiter API error for token ${tokenMint}:`, errorMessage);
          return null;
        }
        throw new Error(`Jupiter API request failed with status ${response.status}`);
      }

      const data = await response.json();

      // API returns an array, get the first result
      if (Array.isArray(data) && data.length > 0) {
        return data[0] as JupiterTokenData;
      }

      return null;
    } catch (error: any) {
      console.error(`❌ Error fetching organic score for token ${tokenMint}:`, error.message);
      return null;
    }
  }
}




