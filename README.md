<p align="center">
  <a href="https://trpc.io/"><img src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg" alt="tRPC" height="75"/></a>
</p>

<h3 align="center">tRPC</h3>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
</p>

# `trpc-svelte-query`

> A tRPC wrapper around @tanstack/svelte-query.

<!-- ## Documentation

Full documentation for `trpc-svelte-query` can be found [here](https://trpc.io/docs/svelte-query) -->

## Installation

```bash
# npm
npm install trpc-svelte-query @tanstack/svelte-query

# Yarn
yarn add trpc-svelte-query @tanstack/svelte-query

# pnpm
pnpm add trpc-svelte-query @tanstack/svelte-query
```

## Basic Example

Setup tRPC in `lib/trpc/client.ts`

```ts
import { createTRPCSvelte, httpBatchLink } from 'trpc-svelte-query';
// Import the router type from your server file
import type { AppRouter } from './routes/_app';

export const trpc = createTRPCSvelte<AppRouter>({
  links: [httpBatchLink()],
});
```

Set up svelte-query's provider to in your root layout.

```svelte
<script lang="ts">
  import { QueryClientProvider, QueryClient } from '@tanstack/svelte-query';
	import { trpc } from '$lib/trpc/client';
</script>

<QueryClientProvider client={trpc.queryClient}>
  <slot />
</QueryClientProvider>
```

Now in any component, you can query your API using the client you created.

```svelte
<script lang="ts">
	import { trpc } from '$lib/trpc/client';

	const query = trpc.greeting.query({ name: 'tRPC' });

</script>

{#if $query.isSuccess}
	<p>{$query.data.greeting}</p>
{:else if $query.isError}
	<p>{$query.error.message}</p>
{:else}
	<p>Loading...</p>
{/if}
```

## SSR with SvelteKit

Update your `lib/trpc/client.ts` file to use the Svelte `ssrLink`.

The `ssrLink` wraps around any other link you're using, using your link during normal fetching and custom logic
during SSR.

```svelte
import { createTRPCSvelte, httpBatchLink } from 'trpc-svelte-query';
import { ssrLink } from 'trpc-svelte-query/ssr';
import type { AppRouter } from './routes/_app';

export const trpc = createTRPCSvelte<AppRouter>({
  links: [
    ssrLink(httpBatchLink)({
      url: '/api/trpc',
    }),
  ],
});
```

Add a root `+layout.server.ts` to pass SSR data from the server to the client.

```ts
import { trpc } from '$lib/trpc/client';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  return {
    trpc: trpc.ssr(event),
  };
};
```

Update your root layout to hydrate that SSR data.

```svelte
<script lang="ts">
	import { trpc } from '$lib/trpc/client';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	const queryClient = trpc.hydrateQueryClient(data.trpc);
</script>

<QueryClientProvider client={queryClient}>
	<slot />
</QueryClientProvider>
```

Add a `+page.server.ts` file to SSR specific queries.

```ts
import { trpc } from '$lib/trpc/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  await trpc.greeting.ssr({ name: "tRPC" }, event);
};
```
