import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { Config } from '../utils/config';

export interface MigrationDetectionResult {
  isMigration: boolean;
  tokenMint?: string;
  signature?: string;
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
    const hasMigrateInstruction = this.hasMigrateInstruction(instructions, logMessages);
    const hasPoolCreation = this.hasPoolCreation(instructions, logMessages);
    const hasLpBurn = this.hasLpTokenBurn(logMessages);
    const hasMigrationTransfer = this.hasMigrationTransfer(logMessages);

    // Migration is detected if we have migrate instruction or combination of pool creation + LP burn
    const isMigration = hasMigrateInstruction || (hasPoolCreation && hasLpBurn && hasMigrationTransfer);

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
    // Check log messages for migration-related logs
    const migrationLogs = logMessages.filter(log => 
      log.toLowerCase().includes('migrate') ||
      log.toLowerCase().includes('migration')
    );

    if (migrationLogs.length > 0) {
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
    }

    // Try to extract from account keys (token mint is often in the accounts)
    const accountKeys = tx?.message?.accountKeys || [];
    // Token mints are typically 32-byte addresses
    // Look for accounts that might be token mints (this is a heuristic)
    for (const account of accountKeys) {
      if (typeof account === 'string' && account.length === 44) {
        // Could be a token mint, but we need more context
        // For now, return the first account that looks like a mint
        // In production, you'd want more sophisticated detection
      }
    }

    return undefined;
  }
}




