import { defineConfig } from "tsup";

export default defineConfig({
	entry: ['src/index.ts', 'src/ssr/index.ts', 'src/shared/index.ts'],
	dts: true,
	format: ['esm', 'cjs']
});
