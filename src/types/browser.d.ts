import type { PublisherStatus, ListingData } from './services/browserPublisher';

declare global {
  interface Window {
    werkscan: {
      platform: string;
      browser: {
        openPublisher: (url: string) => Promise<{ ok: boolean; error?: string }>;
        closePublisher: () => Promise<{ ok: boolean }>;
        postListing: (data: ListingData) => Promise<{ ok: boolean; error?: string; result?: unknown }>;
        fillForm: (data: ListingData) => Promise<{ ok: boolean; error?: string }>;
        getStatus: () => Promise<PublisherStatus>;
        onStatus: (callback: (status: PublisherStatus) => void) => void;
        onLoaded: (callback: (info: { url: string }) => void) => void;
      };
    };
  }
}

export {};
