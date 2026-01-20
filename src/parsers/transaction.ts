import { MigrationTransaction } from '../types';
import { ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';

export class TransactionParser {
  async parseMigrationTransactionFromParsed(
    tx: ParsedTransactionWithMeta,
    tokenMint: string | undefined,
    signature: string
  ): Promise<MigrationTransaction | null> {
    if (!tx || !tx.meta) {
      return null;
    }

    const timestamp = Date.now(); // Use current time, or fetch from transaction if available

    // Extract token mint if not provided
    const mint = tokenMint || this.extractTokenMintFromTransaction(tx);

    if (!mint) {
      console.warn('Could not extract token mint from transaction');
      return null;
    }

    // Extract liquidity pool address
    const liquidityPool = this.extractLiquidityPool(tx);

    // Extract SOL amount transferred
    const solAmount = this.extractSolAmount(tx.meta);

    // Build transaction URL
    const transactionUrl = `https://solscan.io/tx/${signature}`;

    return {
      signature,
      tokenMint: mint,
      timestamp,
      liquidityPool,
      solAmount,
      transactionUrl,
    };
  }

  private extractTokenMintFromTransaction(tx: ParsedTransactionWithMeta): string | undefined {
    const instructions = tx.transaction.message.instructions || [];
    const accountKeys = tx.transaction.message.accountKeys.map(key =>
      typeof key === 'string' ? key : key.pubkey.toString()
    );

    // For pump.fun migrations, prioritize addresses ending with "pump"
    // Look for pump addresses first
    for (const account of accountKeys) {
      if (typeof account === 'string' && account.endsWith('pump') && account.length === 44) {
        try {
          new PublicKey(account);
          return account;
        } catch {
          // Not a valid public key
        }
      }
    }

    // Try to find token mint in instructions
    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed) {
        const mint = (ix.parsed as any).info?.mint || 
                    (ix.parsed as any).info?.tokenMint ||
                    (ix.parsed as any).info?.account;
        if (mint) {
          return mint;
        }
      }

      // Check accounts array in instruction for pump addresses
      if ('accounts' in ix && Array.isArray(ix.accounts)) {
        for (const accountIndex of ix.accounts) {
          const index = typeof accountIndex === 'number' ? accountIndex : parseInt(accountIndex.toString());
          if (index >= 0 && index < accountKeys.length) {
            const account = accountKeys[index];
            if (account && typeof account === 'string' && account.endsWith('pump') && account.length === 44) {
              try {
                new PublicKey(account);
                return account;
              } catch {
                // Not a valid public key
              }
            }
          }
        }
      }
    }

    // Fallback: look for token mint in account keys (skip known program addresses)
    const knownPrograms = [
      '11111111111111111111111111111111',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    ];

    for (const account of accountKeys) {
      if (typeof account === 'string' && account.length === 44 && !knownPrograms.includes(account)) {
        try {
          new PublicKey(account);
          return account;
        } catch {
          // Not a valid public key
        }
      }
    }

    return undefined;
  }

  private extractLiquidityPool(tx: ParsedTransactionWithMeta): string | undefined {
    const logMessages = tx.meta?.logMessages || [];
    
    // Look for pool address in logs
    for (const log of logMessages) {
      // Try to extract address from log messages
      const addressMatch = log.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
      if (addressMatch) {
        const address = addressMatch[0];
        try {
          new PublicKey(address);
          // This could be a pool address
          return address;
        } catch {
          // Not a valid public key
        }
      }
    }

    // Check account keys for potential pool addresses
    const accountKeys = tx.transaction.message.accountKeys.map(key =>
      typeof key === 'string' ? key : key.pubkey.toString()
    );
    // Pool addresses are typically in specific positions, but this is heuristic
    return undefined;
  }

  private extractSolAmount(meta: any): number | undefined {
    if (!meta) {
      return undefined;
    }

    const preBalances = meta.preBalances || [];
    const postBalances = meta.postBalances || [];

    // Calculate total SOL transferred
    let totalSol = 0;
    for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
      const diff = (postBalances[i] - preBalances[i]) / 1e9; // Convert lamports to SOL
      if (diff > 0) {
        totalSol += diff;
      }
    }

    return totalSol > 0 ? totalSol : undefined;
  }
}

