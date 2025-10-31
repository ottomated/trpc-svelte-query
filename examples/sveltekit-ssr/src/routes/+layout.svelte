<script lang="ts">
	import { trpc } from '$lib/trpc';
	import { QueryClientProvider } from '@tanstack/svelte-query';

	const { data, children } = $props();

	trpc.hydrateFromServer(() => data.trpc);
</script>

<QueryClientProvider client={trpc.queryClient}>
	{@render children?.()}
</QueryClientProvider>
