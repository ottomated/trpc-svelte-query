<script lang="ts">
	import { page } from '$app/state';
	import { trpc } from '$lib/trpc';

	const todo = trpc.todos.get.query({ id: page.params.id });
</script>

<h1>Todo {$todo.status}</h1>

{#if $todo.isSuccess}
	<p>Data: {$todo.data}</p>
{:else if $todo.isError}
	<p>Error: {$todo.error.message}</p>
{/if}
