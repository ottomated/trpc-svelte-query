<p align="center">
  <a href="https://trpc.io/"><img src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg" alt="tRPC" height="75"/></a>
</p>

<h3 align="center">trpc-svelte-query</h3>

<p align="center">
  <strong>Type-safe svelte(kit) tRPC integration with <code>@tanstack/svelte-query</code></strong>
</p>

## Contents

- [Installation](#installation)
- [Basic Example](#basic-example)
- [SSR Example](#ssr-with-sveltekit)
- [Migrating from v2](#migrating-from-v2)

## Installation

```bash
pnpm i trpc-svelte-query @tanstack/svelte-query
```

## Basic Example

Set up tRPC in `lib/trpc/index.ts`

```ts
// Import the router type from your server file
import type { AppRouter } from '$lib/server/routes/_app';
import { createTRPCSvelte, httpBatchLink } from 'trpc-svelte-query';

export const trpc = createTRPCSvelte<AppRouter>({
	links: [
		httpBatchLink({
			url: '/api/trpc',
		}),
	],
});
```

Set up `@tanstack/svelte-query`'s provider in your root layout.

```svelte
<script lang="ts">
  import { QueryClientProvider } from '@tanstack/svelte-query';
  import { trpc } from '$lib/trpc/client';

	const { children } = $props();
</script>

<QueryClientProvider client={trpc.queryClient}>
  {@render children?.()}
</QueryClientProvider>
```

Set up your API handler in `routes/api/trpc/[...trpc]/+server.ts`

```ts
import { appRouter } from '$lib/server/routes/_app';
import { createTRPCSvelteServer } from 'trpc-svelte-query/server';

const trpcServer = createTRPCSvelteServer({
	endpoint: '/api/trpc',
	router: appRouter,
});

export const GET = trpcServer.handler;
export const POST = trpcServer.handler;
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

Extract your `trpcServer` instance into its own file (i.e. `$lib/server/server`). You'll use this object to handle SSR.

```ts
import { appRouter } from '$lib/server/routes/_app';
import { createTRPCSvelteServer } from 'trpc-svelte-query/server';

export const trpcServer = createTRPCSvelteServer({
	endpoint: '/api/trpc',
	router: appRouter,
});
```

Use that instance in your api endpoint:

```ts
import { trpcServer } from '$lib/server/server';

export const GET = trpcServer.handler;
export const POST = trpcServer.handler;
```

Add a root `+layout.server.ts` to pass SSR data from the server to the client.

```ts
import { trpcServer } from '$lib/server/server';

export const load = async (event) => {
	return {
		trpc: trpcServer.hydrateToClient(event),
	};
};
```

Update your root layout to hydrate that SSR data.

```svelte
<script lang="ts">
  import { trpc } from '$lib/trpc/client';

	const { data, children } = $props();

  trpc.hydrateFromServer(() => data.trpc);
</script>

{@render children?.()}
```

Add a `+page.server.ts` file to preload specific queries.

```ts
import { trpc } from '$lib/server/server';

export const load = async () => {
	await trpcServer.greeting.ssr({ name: 'tRPC' });
};
```

## Migrating from v2

- Update tRPC to `v11` ([migration guide](https://trpc.io/docs/migrate-from-v10-to-v11))
- Update SvelteKit to at least `2.20.0`
- Remove QueryClientProvider if using SSR:

```diff
 +layout.svelte:

<script lang="ts">
-  import { QueryClientProvider } from '@tanstack/svelte-query';

  import { trpc } from '$lib/trpc/client';

  const { data, children } = $props();

-  const queryClient = trpc.hydrateFromServer(data.trpc);
+  trpc.hydrateFromServer(() => data.trpc);
</script>

- <QueryClientProvider client={queryClient}>
{@render children?.()}
- </QueryClientProvider>
```

- Don't pass `event` into SSR functions:

```diff
import { trpc } from '$lib/server/server';

export const load = async () => {
-  await trpcServer.greeting.ssr({ name: 'tRPC' }, event);
+  await trpcServer.greeting.ssr({ name: 'tRPC' });
};
```
