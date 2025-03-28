<script lang="ts">
	import { trpc } from '$lib/trpc';
	const infinite = trpc.infinite.infiniteQuery(
		{},
		{
			initialPageParam: 0,
			getNextPageParam: (lastPage) => lastPage?.nextCursor ?? 0,
		},
	);
</script>

<h1>Todo {$infinite.status}</h1>

{#if $infinite.isSuccess}
	<p>Data: {JSON.stringify($infinite.data)}</p>
{:else if $infinite.isError}
	<p>Error: {$infinite.error.message}</p>
{/if}

<button on:click={() => $infinite.fetchNextPage()}>More</button>
