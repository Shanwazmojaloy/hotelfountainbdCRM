// Type stub for imapflow — full types ship with the package at runtime.
// This declaration prevents tsc from erroring in environments where the
// package is not installed (e.g., CI lint without npm install).
declare module 'imapflow' {
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    logger?: boolean | Record<string, unknown>;
    tls?: Record<string, unknown>;
  }

  export interface FetchMessageObject {
    uid: number;
    envelope?: {
      date?: Date;
      subject?: string;
      from?: Array<{ name?: string; address?: string }>;
      messageId?: string;
    };
    bodyParts?: Map<string, Buffer>;
    flags?: Set<string>;
  }

  // ImapFlow uses a broad source type: UID range string, sequence number,
  // array of UIDs, or a search criteria object (e.g. { seen: false }).
  type ImapSource = string | number | number[] | Record<string, unknown>;

  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    getMailboxLock(path: string): Promise<{ release(): void }>;
    search(criteria: Record<string, unknown>, options?: { uid?: boolean }): Promise<number[]>;
    fetch(
      source: ImapSource,
      query: Record<string, unknown>,
      options?: { uid?: boolean }
    ): AsyncIterable<FetchMessageObject>;
    messageFlagsAdd(
      source: ImapSource,
      flags: string[],
      options?: { uid?: boolean }
    ): Promise<void>;
  }
}
