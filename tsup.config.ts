import { defineConfig } from "tsup";

export default defineConfig({
	entry: ['src/index.ts', 'src/server/index.ts', 'src/shared/index.ts'],
	dts: true,
	format: ['esm', 'cjs']
});
