import { defineConfig } from 'tsup';

export default defineConfig({
	entry: {
		'index.svelte': 'src/index.ts',
		server: 'src/server/index.ts',
	},
	dts: true,
	format: 'esm',
	external: ['$app/environment', '$app/server'],
});
