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

# `@trpc/svelte-query`

> A tRPC wrapper around @tanstack/svelte-query.

## Documentation

Full documentation for `@trpc/svelte-query` can be found [here](https://trpc.io/docs/svelte-query)

## Installation

```bash
# npm
npm install @trpc/svelte-query @tanstack/svelte-query

# Yarn
yarn add @trpc/svelte-query @tanstack/svelte-query

# pnpm
pnpm add @trpc/svelte-query @tanstack/svelte-query
```

## Basic Example

Setup tRPC in `lib/trpc/client.ts`

```ts
import { createTRPCSvelte, httpBatchLink } from '@trpc/svelte-query';
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

  const queryClient = new QueryClient();
</script>

<QueryClientProvider client={queryClient}>
  <slot />
</QueryClientProvider>
```

Now in any component, you can query your API using the client you created.

```svelte
<script lang="ts">
	import { trpc } from '$lib/trpc/client';

	const query = trpc.greeting.createQuery({ name: 'tRPC' });

</script>

{#if $query.error}
	<p>{$query.error.message}</p>
{:else if $query.status !== 'success'}
	<p>Loading...</p>
{:else if $query.data}
	<p>{$query.data.greeting}</p>
{/if}
```
