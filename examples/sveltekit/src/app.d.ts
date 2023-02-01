// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare namespace App {
  // interface Error {}
  interface Locals {
    trpc: {
      prefetch: (query: string, input?: unknown) => Promise<void>;
      map: Map<string, unknown>;
    };
  }
  // interface PageData {}
  // interface Platform {}
}
