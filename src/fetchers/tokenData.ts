import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { TokenData } from '../types';

export class TokenDataFetcher {
  private connection: Connection;
  private birdeyeApiKey?: string;

  constructor(rpcUrl: string = 'https://api.mainnet-beta.solana.com', birdeyeApiKey?: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.birdeyeApiKey = birdeyeApiKey;
  }

  async fetchTokenData(mintAddress: string): Promise<TokenData | null> {
    try {
      const mint = new PublicKey(mintAddress);
      
      // Fetch token metadata
      const metadata = await this.fetchTokenMetadata(mintAddress);
      
      // Fetch price and market data
      const priceData = await this.fetchPriceData(mintAddress);

      return {
        mint: mintAddress,
        name: metadata.name || 'Unknown Token',
        symbol: metadata.symbol || 'UNKNOWN',
        decimals: metadata.decimals || 9,
        price: priceData.price,
        marketCap: priceData.marketCap,
        liquidity: priceData.liquidity,
        logoUrl: metadata.logoUrl,
      };
    } catch (error) {
      console.error(`Error fetching token data for ${mintAddress}:`, error);
      return null;
    }
  }

  private async fetchTokenMetadata(mintAddress: string): Promise<{
    name?: string;
    symbol?: string;
    decimals?: number;
    logoUrl?: string;
  }> {
    try {
      // Try to get decimals from on-chain
      const mint = new PublicKey(mintAddress);
      const mintInfo = await this.connection.getParsedAccountInfo(mint);
      const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals;

      // Try to fetch metadata from Jupiter token list or other sources
      try {
        const response = await axios.get(`https://token.jup.ag/strict`, {
          timeout: 5000,
        });
        const token = response.data.find((t: any) => t.address === mintAddress);
        if (token) {
          return {
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals || decimals,
            logoUrl: token.logoURI,
          };
        }
      } catch (error) {
        // Jupiter API failed, continue with other methods
      }

      // Try Birdeye API if available
      if (this.birdeyeApiKey) {
        try {
          const response = await axios.get(
            `https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`,
            {
              headers: {
                'X-API-KEY': this.birdeyeApiKey,
              },
              timeout: 5000,
            }
          );
          const data = response.data?.data;
          if (data) {
            return {
              name: data.name,
              symbol: data.symbol,
              decimals: data.decimals || decimals,
              logoUrl: data.logoURI,
            };
          }
        } catch (error) {
          // Birdeye API failed
        }
      }

      // Fallback: return basic info
      return {
        decimals: decimals || 9,
      };
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      return {
        decimals: 9,
      };
    }
  }

  private async fetchPriceData(mintAddress: string): Promise<{
    price?: number;
    marketCap?: number;
    liquidity?: number;
  }> {
    // Try Birdeye API first
    if (this.birdeyeApiKey) {
      try {
        const response = await axios.get(
          `https://public-api.birdeye.so/defi/price?address=${mintAddress}`,
          {
            headers: {
              'X-API-KEY': this.birdeyeApiKey,
            },
            timeout: 5000,
          }
        );
        const data = response.data?.data;
        if (data) {
          return {
            price: data.value,
            marketCap: data.marketCap,
            liquidity: data.liquidity,
          };
        }
      } catch (error) {
        // Birdeye API failed
      }
    }

    // Try Jupiter price API
    try {
      const response = await axios.get(
        `https://price.jup.ag/v4/price?ids=${mintAddress}`,
        {
          timeout: 5000,
        }
      );
      const priceData = response.data?.data?.[mintAddress];
      if (priceData) {
        return {
          price: priceData.price,
        };
      }
    } catch (error) {
      // Jupiter price API failed
    }

    // Try DexScreener as fallback
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
        {
          timeout: 5000,
        }
      );
      const pairs = response.data?.pairs;
      if (pairs && pairs.length > 0) {
        const pair = pairs[0];
        return {
          price: parseFloat(pair.priceUsd || '0'),
          marketCap: pair.marketCap ? parseFloat(pair.marketCap) : undefined,
          liquidity: pair.liquidity ? parseFloat(pair.liquidity.usd) : undefined,
        };
      }
    } catch (error) {
      // DexScreener API failed
    }

    return {};
  }
}







