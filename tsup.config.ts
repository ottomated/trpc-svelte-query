import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.svelte.ts', 'src/server/index.ts', 'src/shared/index.ts'],
	dts: true,
	format: 'esm',
	external: ['$app/environment', '$app/server'],
});
