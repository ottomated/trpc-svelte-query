<script lang="ts">
	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc/client';

	const name = trpc.names.get.query({ id: $page.params.id });
</script>

<h1>{$name.data} {$name.status}</h1>
