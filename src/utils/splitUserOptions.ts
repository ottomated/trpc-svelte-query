import { TRPCRequestOptions } from '@trpc/client';
import type { TodoTypeName, UserExposedOptions } from '../createTRPCSvelte';

export function splitUserOptions<TOptions = unknown>(
	options: UserExposedOptions<TOptions> | undefined,
): [
	trpcOptions: TRPCRequestOptions | undefined,
	tanstackQueryOptions: TodoTypeName<TOptions> | undefined,
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

	return [trpcOptions, options];
}
