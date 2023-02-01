<script lang="ts">
  import { browser } from '$app/environment';
  import { trpc } from '$lib/trpc/client';
	import { QueryClientProvider, QueryClient } from '@tanstack/svelte-query';
  import type { LayoutData } from './$types';

	export let data: LayoutData;

	const queryClient = trpc.hydrateQueryClient(data.trpc);

</script>

<QueryClientProvider client={queryClient}>
	<slot />
</QueryClientProvider>
