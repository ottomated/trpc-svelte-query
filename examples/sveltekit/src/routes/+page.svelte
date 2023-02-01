<script lang="ts">
	import { trpc } from '$lib/trpc/client';

	const names = trpc.names.list.query();

	let newName = '';

	const invalidator = {
		onSuccess: () => {
			trpc.names.list.utils.invalidate();
		},
	};
	const addName = trpc.names.add.mutation(invalidator);
	const updateName = trpc.names.update.mutation(invalidator);
	const deleteName = trpc.names.delete.mutation(invalidator);
</script>

<h1>Names</h1>


{#if $names.isSuccess}
	{#each $names.data as name}
	<a href="/names/{name.id}">{name.name}</a>
		<p data-id={name.id}>
			<input value={name.name} on:blur={(ev) => {
				$updateName.mutate({
					id: name.id,
					name: ev.currentTarget.value,
				});
			}} />
			<button on:click={() => {
				$deleteName.mutate({ id: name.id });
			}}>
				delete
			</button>
		</p>
	{/each}
{:else if $names.isError}
	<p>Error: {$names.error.message}</p>
{:else}
	<p>Loading...</p>
{/if}

<input bind:value={newName} placeholder="New name" />
<button disabled={$addName.isLoading} on:click={() => {
	$addName.mutate({ name: newName });
	newName = '';
}}>
	Add Name
</button>

<h2>State</h2>

<pre>{JSON.stringify($names, null, 2)}</pre>
