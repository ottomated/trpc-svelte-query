import { browser } from '$app/environment';
import type {
	CancelOptions,
	FetchInfiniteQueryOptions,
	FetchQueryOptions,
	InfiniteData,
	InvalidateOptions,
	InvalidateQueryFilters,
	QueryFilters,
	QueryFunction,
	QueryKey,
	RefetchOptions,
	RefetchQueryFilters,
	ResetOptions,
	SetDataOptions,
	Updater,
} from '@tanstack/svelte-query';
import { QueryClient, useQueryClient } from '@tanstack/svelte-query';
import { type TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import type { UserExposedOptions } from '../createTRPCSvelte.svelte';
import {
	type QueryType,
	getArrayQueryKey,
} from '../internals/getArrayQueryKey';
import { splitUserOptions } from '../utils/splitUserOptions';

/**
 * @internal
 */
export type ResolverDef = {
	input: any;
	output: any;
	transformer: boolean;
	errorShape: any;
};

/**
 * @internal
 */
export type QueryUtils<TDef extends ResolverDef> = {
	invalidate: (
		input: TDef['input'],
		filters?: InvalidateQueryFilters,
		options?: InvalidateOptions,
	) => Promise<void>;
	prefetch: (
		input: TDef['input'],
		options?: UserExposedOptions<
			FetchQueryOptions<TDef['input'], TRPCClientErrorLike<TDef>>
		>,
	) => Promise<void>;
	fetch: (
		input: TDef['input'],
		options?: UserExposedOptions<
			FetchQueryOptions<TDef['input'], TRPCClientErrorLike<TDef>>
		>,
	) => Promise<TDef['output']>;
	refetch: (
		input: TDef['input'],
		filters?: RefetchQueryFilters,
		options?: RefetchOptions,
	) => Promise<void>;
	cancel: (
		input: TDef['input'],
		filters?: QueryFilters,
		options?: CancelOptions,
	) => Promise<void>;
	reset: (
		input: TDef['input'],
		filters?: QueryFilters,
		options?: ResetOptions,
	) => Promise<void>;
	setData: (
		input: TDef['input'],
		updater: Updater<TDef['output'] | undefined, TDef['output'] | undefined>,
		options?: SetDataOptions,
	) => TDef['output'] | undefined;
	getData: (
		input: TDef['input'],
		filters?: QueryFilters,
	) => TDef['output'] | undefined;
};

type ExtractCursorType<TInput> = TInput extends { cursor?: any }
	? TInput['cursor']
	: unknown;

export type InfiniteQueryUtils<TDef extends ResolverDef> = QueryUtils<TDef> & {
	prefetchInfinite: (
		input: TDef['input'],
		options?: UserExposedOptions<
			FetchInfiniteQueryOptions<TDef['input'], TRPCClientErrorLike<TDef>>
		>,
	) => Promise<void>;
	fetchInfinite: (
		input: TDef['input'],
		options?: UserExposedOptions<
			FetchInfiniteQueryOptions<TDef['input'], TRPCClientErrorLike<TDef>>
		>,
	) => Promise<InfiniteData<TDef['output']>>;
	getInfiniteData(
		input?: TDef['input'],
		filters?: QueryFilters,
	): InfiniteData<TDef['output'], ExtractCursorType<TDef['input']>> | undefined;
	setInfiniteData(
		input: TDef['input'],
		updater: Updater<
			| InfiniteData<TDef['output'], ExtractCursorType<TDef['input']>>
			| undefined,
			InfiniteData<TDef['output'], ExtractCursorType<TDef['input']>> | undefined
		>,
		options?: SetDataOptions,
	): void;
};

/**
 * @internal
 */
export type DecorateRouterUtils = {
	utils: {
		invalidate(
			input?: undefined,
			filters?: InvalidateQueryFilters,
			options?: InvalidateOptions,
		): Promise<void>;
		refetch: (
			input?: undefined,
			filters?: RefetchQueryFilters,
			options?: RefetchOptions,
		) => Promise<void>;
		cancel: (
			input?: undefined,
			filters?: QueryFilters,
			options?: CancelOptions,
		) => Promise<void>;
		reset: (
			input?: undefined,
			filters?: QueryFilters,
			options?: ResetOptions,
		) => Promise<void>;
	};
};

type ContextMethod = keyof InfiniteQueryUtils<ResolverDef>;

const queryTypes: Record<ContextMethod, QueryType> = {
	invalidate: 'any',
	prefetch: 'query',
	prefetchInfinite: 'infinite',
	fetch: 'query',
	fetchInfinite: 'infinite',
	refetch: 'any',
	cancel: 'any',
	reset: 'any',
	setData: 'query',
	setInfiniteData: 'infinite',
	getData: 'query',
	getInfiniteData: 'infinite',
};

export function callUtilMethod<TRouter extends AnyTRPCRouter>(
	trpc: TRPCUntypedClient<TRouter>,
	client: QueryClient,
	path: string[],
	method: ContextMethod,
	args: readonly any[],
): unknown {
	// If we're not in the browser, we need to use the queryClient from the context,
	// which will fail unless called during component initialization
	if (!browser) {
		// This isn't a hook
		client = useQueryClient();
	}

	const queryType = queryTypes[method];
	const queryKey = getArrayQueryKey(path, args[0], queryType);

	const getFilters = () => {
		const filters = (args[1] as QueryFilters | undefined) ?? {};
		filters.queryKey = queryKey;
		return filters;
	};

	switch (method) {
		case 'prefetch':
		case 'fetch':
		case 'prefetchInfinite':
		case 'fetchInfinite': {
			const joinedPath = path.join('.');

			const options = args[1] as UserExposedOptions<any> | undefined;
			const [trpcOptions, tanstackQueryOptions] = splitUserOptions(options);

			const queryFn: QueryFunction<unknown, QueryKey, unknown> =
				queryType === 'query'
					? () => trpc.query(joinedPath, args[0], trpcOptions)
					: (context) => {
							const input = { ...args[0], cursor: context.pageParam };
							return trpc.query(joinedPath, input, trpcOptions);
						};

			// tanstack query methods look like fetchQuery, prefetchInfiniteQuery, etc., so we append "Query"
			return (client as any)[method + 'Query']({
				...tanstackQueryOptions,
				queryKey,
				queryFn,
			});
		}
		case 'invalidate':
			return client.invalidateQueries(getFilters(), args[2]);
		case 'refetch':
			return client.refetchQueries(getFilters(), args[2]);
		case 'cancel':
			return client.cancelQueries(getFilters(), args[2]);
		case 'reset':
			return client.resetQueries(getFilters(), args[2]);
		case 'setData':
		case 'setInfiniteData':
			return client.setQueryData(queryKey, args[1], args[2]);
		case 'getData':
		case 'getInfiniteData':
			return client.getQueryData(queryKey);
		default:
			throw new TypeError(`trpc.${path}.${method} is not a function`);
	}
}
