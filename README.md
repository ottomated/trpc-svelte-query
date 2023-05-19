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
# pnpm
pnpm add trpc-svelte-query @tanstack/svelte-query

# Yarn
yarn add trpc-svelte-query @tanstack/svelte-query

# npm
npm install trpc-svelte-query @tanstack/svelte-query
```

## Basic Example

Set up tRPC in `lib/trpc/index.ts`

```ts
import { createTRPCSvelte, httpBatchLink } from 'trpc-svelte-query';
// Import the router type from your server file
import type { AppRouter } from '$lib/server/routes/_app';

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
</script>

<QueryClientProvider client={trpc.queryClient}>
  <slot />
</QueryClientProvider>
```

Set up your API handler in `routes/api/trpc/[...trpc]/+server.ts`

```ts
import { createTRPCSvelteServer } from 'trpc-svelte-query/server';
import { appRouter } from '$lib/server/routes/_app';

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
import { createTRPCSvelteServer } from 'trpc-svelte-query/server';
import { appRouter } from '$lib/server/routes/_app';

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
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  return {
    trpc: trpcServer.hydrateToClient(event),
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

  const queryClient = trpc.hydrateFromServer(data.trpc);
</script>

<QueryClientProvider client={queryClient}>
  <slot />
</QueryClientProvider>
```

Add a `+page.server.ts` file to preload specific queries.

```ts
import { trpc } from '$lib/server/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  await trpcServer.greeting.ssr({ name: 'tRPC' }, event);
};
```
