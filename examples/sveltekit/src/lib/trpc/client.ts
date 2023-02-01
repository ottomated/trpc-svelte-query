import { createTRPCSvelte, httpBatchLink } from 'trpc-svelte-query';
import { ssrLink } from 'trpc-svelte-query/ssr';
import type { AppRouter } from './routes/_app';

export const trpc = createTRPCSvelte<AppRouter>({
  links: [
    ssrLink(httpBatchLink)({
      url: '/api/trpc',
    }),
  ],
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 1000 * 10,
      },
    },
  },
});
