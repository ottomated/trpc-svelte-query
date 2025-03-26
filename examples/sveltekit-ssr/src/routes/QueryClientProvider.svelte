<script>
	import { setContext } from 'svelte';

	const { client, children } = $props();

	setContext('$$_queryClient', client);
	$effect(() => {
		client.mount();
		return () => client.unmount();
	});
</script>

{@render children()}
