<script lang="ts">
	import { trpc } from '$lib/trpc';
	import { QueryClientProvider } from '@tanstack/svelte-query';
</script>

<QueryClientProvider client={trpc.queryClient}>
	<slot />
</QueryClientProvider>
