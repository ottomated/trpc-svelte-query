import type { TRPCRequestOptions } from '@trpc/client';
import type {
	UserExposedOptions,
	UserExposedTanstackQueryOptions,
} from '../createTRPCSvelte.svelte';

export function splitUserOptions<TOptions = unknown>(
	options: UserExposedOptions<TOptions> | undefined,
): [
	tanstackQueryOptions: UserExposedTanstackQueryOptions<TOptions>,
	trpcOptions: TRPCRequestOptions,
] {
	if (options === undefined) {
		// Both options are optional, so we can return an empty array
		return [] as any;
	}

	const trpcOptions = {
		context: options.context,
		signal: options.signal,
	};
	delete options.context;
	delete options.signal;

	return [options, trpcOptions];
}
