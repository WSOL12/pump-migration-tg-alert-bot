import WebSocket from 'ws';
import { Config } from '../utils/config';
import { HeliusWebSocketMessage } from '../types';

export class HeliusWebSocketClient {
  private ws: WebSocket | null = null;
  private config: Config;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private subscriptionId: number | null = null;
  private onTransactionCallback: (message: HeliusWebSocketMessage) => void;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private isReconnecting: boolean = false;

  constructor(config: Config, onTransaction: (message: HeliusWebSocketMessage) => void) {
    this.config = config;
    this.onTransactionCallback = onTransaction;
  }

  connect(): void {
    // Use the same endpoint format as the copy trade bot
    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${this.config.heliusApiKey}`;
    
    const maskedUrl = wsUrl.replace(/api-key=[^&]+/, 'api-key=***');
    console.log(`Connecting to Helius WebSocket: ${maskedUrl}`);
    console.log(`Using API key: ${this.config.heliusApiKey.substring(0, 8)}...`);
    
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('✅ Connected to Helius WebSocket');
      this.reconnectAttempts = 0;
      this.startPingInterval();
      this.subscribeToTransactions();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message: HeliusWebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error: any) => {
      console.error('WebSocket error:', error.message || error);
      
      // Provide helpful error messages
      if (error.message && error.message.includes('403')) {
        console.error('\n❌ 403 Forbidden Error - Possible causes:');
        console.error('1. Invalid API key - Check your HELIUS_API_KEY in .env');
        console.error('2. API key may not have WebSocket access enabled');
        console.error('3. IP restrictions may be blocking your connection');
        console.error('4. Check your Helius dashboard: https://www.helius.dev/');
        console.error('\nMake sure your API key is correct and has WebSocket permissions.\n');
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString();
      console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reasonStr || 'none'}`);
      
      // Don't reconnect on 403 errors (authentication failure)
      if (code === 1008 || code === 1003) {
        console.error('Authentication failed. Please check your API key.');
        return;
      }
      
      console.log('Reconnecting in 5 seconds...');
      this.cleanup();
      this.scheduleReconnect();
    });
  }

  private subscribeToTransactions(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Wait a bit for WebSocket to be fully ready (same as copy trade bot)
    setTimeout(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket closed before subscription');
        return;
      }

      // Subscribe only to pump.fun program - we'll filter for migrations from all transactions
      const subscribeMessage = {
        jsonrpc: '2.0',
        id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
        method: 'logsSubscribe',
        params: [
          {
            mentions: [this.config.pumpFunProgramId],
          },
          {
            commitment: 'confirmed',
          },
        ],
      };

      this.ws!.send(JSON.stringify(subscribeMessage));
      console.log(`Subscribed to pump.fun program logs: ${this.config.pumpFunProgramId.substring(0, 8)}...`);
    }, 1000);
  }

  private handleMessage(message: HeliusWebSocketMessage): void {
    // Handle errors
    if ((message as any).error) {
      const error = (message as any).error;
      // Only log non-parse errors (parse errors are common with Helius)
      if (error.code !== -32700) {
        console.error(`WebSocket error: ${JSON.stringify(error)}`);
      }
      return;
    }

    // Handle subscription confirmation
    if (message.id && message.params?.result && typeof message.params.result === 'number') {
      this.subscriptionId = message.params.result;
      console.log(`✅ Subscription confirmed. ID: ${this.subscriptionId}`);
      return;
    }

    // Handle log notifications (from logsSubscribe)
    if (message.method === 'logsNotification') {
      this.onTransactionCallback(message);
      return;
    }

    // Handle transaction notifications (fallback for transactionSubscribe)
    if (message.params?.result?.transaction) {
      this.onTransactionCallback(message);
    }
  }

  private startPingInterval(): void {
    // Ping every 10 seconds to keep connection alive (same as copy trade bot)
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch (error) {
          console.error('Error sending ping:', error);
        }
      }
    }, 10000);
  }

  private scheduleReconnect(): void {
    if (this.isReconnecting) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Please check your API key and network connection.');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    const reconnectDelay = 1000; // Fixed 1 second delay (same as copy trade bot)
    
    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${reconnectDelay}ms`);
    
    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      this.isReconnecting = false;
      this.connect();
    }, reconnectDelay);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    this.subscriptionId = null;
  }

  disconnect(): void {
    console.log('Disconnecting from Helius WebSocket...');
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}




