<script lang="ts">
	import { trpc } from '$lib/trpc';
	import { derived, writable } from 'svelte/store';
	const echoInput = writable('');
	const echo = trpc.echo.query(
		derived(echoInput, ($echoInput) => $echoInput.trim()),
	);
</script>

<h1>Echo</h1>

<label>
	Input:
	<input bind:value={$echoInput} />
</label>

<p>Output: {$echo.data}</p>
