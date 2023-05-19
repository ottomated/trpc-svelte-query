<script lang="ts">
	import { trpc } from '$lib/trpc';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	$: queryClient = trpc.hydrateFromServer(data.trpc);
</script>

<QueryClientProvider client={queryClient}>
	<slot />
</QueryClientProvider>
