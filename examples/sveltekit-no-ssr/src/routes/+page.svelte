<script lang="ts">
	import { trpc } from '$lib/trpc';

	const todos = trpc.todos.list.query();

	let newTodo = '';

	const invalidator = {
		onSuccess: () => {
			trpc.todos.list.utils.invalidate();
		},
	};
	const addTodo = trpc.todos.add.mutation(invalidator);
	const updateTodo = trpc.todos.update.mutation(invalidator);
	const deleteTodo = trpc.todos.delete.mutation(invalidator);
</script>

<h1>Todos</h1>

{#if $todos.isSuccess}
	{#each $todos.data as todo}
		<a href="/todos/{todo.id}">{todo.data}</a>
		<p data-id={todo.id}>
			<input
				value={todo.data}
				on:blur={(ev) => {
					$updateTodo.mutate({
						id: todo.id,
						data: ev.currentTarget.value,
					});
				}}
			/>
			<button
				on:click={() => {
					$deleteTodo.mutate({ id: todo.id });
				}}
			>
				delete
			</button>
		</p>
	{/each}
{:else if $todos.isError}
	<p>Error: {$todos.error.message}</p>
{:else}
	<p>Loading...</p>
{/if}

<input bind:value={newTodo} placeholder="New todo" />
<button
	disabled={$addTodo.isPending}
	on:click={() => {
		$addTodo.mutate({ data: newTodo });
		newTodo = '';
	}}
>
	Add Todo
</button>

<h2>State</h2>

<pre>{JSON.stringify($todos, null, 2)}</pre>
