<script lang="ts">
	import { trpc } from '$lib/trpc';

	const { data, children } = $props();

	trpc.hydrateFromServer(() => data.trpc);
</script>

{@render children?.()}
