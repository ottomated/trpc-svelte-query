import { browser } from '$app/environment';
import type {
	CreateInfiniteQueryOptions,
	CreateInfiniteQueryResult,
	CreateMutationOptions,
	CreateMutationResult,
	CreateQueryOptions,
	CreateQueryResult,
	InfiniteData,
	QueryClientConfig,
	UndefinedInitialDataOptions,
} from '@tanstack/svelte-query';
import {
	QueryClient,
	createInfiniteQuery,
	createMutation,
	createQuery,
} from '@tanstack/svelte-query';
import {
	type CreateTRPCClientOptions,
	type TRPCClientErrorLike,
	type TRPCRequestOptions,
	TRPCUntypedClient,
	createTRPCUntypedClient,
} from '@trpc/client';
import type {
	AnyTRPCProcedure,
	AnyTRPCRootTypes,
	AnyTRPCRouter,
	TRPCProcedureType,
	TRPCRouterRecord,
	inferProcedureInput,
	inferTransformedProcedureOutput,
} from '@trpc/server';
import { createTRPCFlatProxy, createTRPCRecursiveProxy } from '@trpc/server';
import type { ProtectedIntersection } from '@trpc/server/unstable-core-do-not-import';
import { onDestroy, onMount, setContext } from 'svelte';
import { type TRPCQueryKey, getQueryKeyInternal } from '../shared/utils';
import type { TRPCSSRData } from '../server/utils';
import {
	type DecorateRouterUtils,
	type InfiniteQueryUtils,
	type QueryUtils,
	type ResolverDef,
	callUtilMethod,
} from './queryUtils';
import { splitUserOptions } from './splitUserOptions';

/**
 * Options passed to @tanstack/svelte-query that are exposed to the user
 * @internal
 */
export type UserExposedTanstackQueryOptions<TOptions> = Omit<
	TOptions,
	'queryFn' | 'queryKey' | 'mutationFn' | 'mutationKey'
>;

/**
 * @internal
 */
export type UserExposedOptions<TOptions> = UserExposedTanstackQueryOptions<TOptions> &
	TRPCRequestOptions;

type DecorateProcedure<
	TType extends TRPCProcedureType,
	TDef extends ResolverDef,
> = TType extends 'query'
	? {
			query: <TData = TDef['output']>(
				input: () => TDef['input'],
				options?: () => UserExposedOptions<
					CreateQueryOptions<TDef['output'], TRPCClientErrorLike<TDef>, TData, TRPCQueryKey>
				>,
			) => CreateQueryResult<TData, TRPCClientErrorLike<TDef>>;
			utils: QueryUtils<TDef>;
		} & (TDef['input'] extends { cursor?: infer TCursor }
			? {
					infiniteQuery: <TData = InfiniteData<TDef['output'], TCursor>>(
						input: () => Omit<TDef['input'], 'cursor'>,
						options: () => UserExposedOptions<
							CreateInfiniteQueryOptions<
								TDef['output'],
								TRPCClientErrorLike<TDef>,
								TData,
								TDef['output'],
								TRPCQueryKey,
								TCursor
							>
						>,
					) => CreateInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>>;
					utils: InfiniteQueryUtils<TDef>;
				}
			: object)
	: TType extends 'mutation'
		? {
				mutation: <TContext = unknown>(
					opts?: () => UserExposedOptions<
						CreateMutationOptions<
							TDef['output'],
							TRPCClientErrorLike<TDef>,
							TDef['input'],
							TContext
						>
					>,
				) => CreateMutationResult<
					TDef['output'],
					TRPCClientErrorLike<TDef>,
					TDef['input'],
					TContext
				>;
			}
		: never;

type DecorateRouterRecord<TRoot extends AnyTRPCRootTypes, TRecord extends TRPCRouterRecord> = {
	[TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
		? $Value extends AnyTRPCProcedure
			? DecorateProcedure<
					$Value['_def']['type'],
					{
						input: inferProcedureInput<$Value>;
						output: inferTransformedProcedureOutput<TRoot, $Value>;
						transformer: TRoot['transformer'];
						errorShape: TRoot['errorShape'];
					}
				>
			: $Value extends TRPCRouterRecord
				? DecorateRouterRecord<TRoot, $Value>
				: never
		: never;
} & DecorateRouterUtils;

/**
 * @internal
 */
export type CreateTRPCSvelteBase = {
	queryClient: QueryClient;
	/**
	 * Usage:
	 * ```ts
	 * const { data } = $props();
	 * trpc.hydrateFromServer(() => data.trpc);
	 * ```
	 * @param data
	 * @returns
	 */
	hydrateFromServer: (data: () => TRPCSSRData) => QueryClient;
};

export type CreateTRPCSvelte<TRouter extends AnyTRPCRouter> = ProtectedIntersection<
	CreateTRPCSvelteBase,
	DecorateRouterRecord<TRouter['_def']['_config']['$types'], TRouter['_def']['record']>
>;

function createSvelteInternalProxy<TRouter extends AnyTRPCRouter>(
	client: TRPCUntypedClient<TRouter>,
	opts: CreateTRPCSvelteOptions<TRouter>,
) {
	let queryClient: QueryClient;
	if (browser) {
		queryClient = new QueryClient(opts.queryClientConfig);
	}

	return createTRPCFlatProxy<CreateTRPCSvelte<TRouter>>((firstPath) => {
		switch (firstPath) {
			case 'queryClient': {
				return queryClient;
			}
			case 'hydrateFromServer': {
				return (data: () => TRPCSSRData) => {
					let client = queryClient;
					if (!browser) {
						client = new QueryClient(opts.queryClientConfig);
					}

					// Run initially on server
					for (const [key, value] of data()) {
						client.setQueryData(key, value);
					}
					let first = true;
					$effect(() => {
						const d = data();
						if (first) {
							first = false;
							return;
						}
						for (const [key, value] of d) {
							client.setQueryData(key, value);
						}
					});

					setContext('$$_queryClient', client);
					onMount(() => {
						client.mount();
					});
					onDestroy(() => {
						client.unmount();
					});
					return client;
				};
			}
		}

		return createTRPCRecursiveProxy(({ path: rawPath, args }) => {
			const path = [firstPath as string, ...rawPath];

			const method = path.pop()!;
			const joinedPath = path.join('.');

			switch (method) {
				case 'query': {
					const inputFn = args[0] as (() => unknown) | undefined;
					const optionsFn = args[1] as (() => UserExposedOptions<CreateQueryOptions>) | undefined;

					return createQuery(() => {
						const input = inputFn?.();
						const [queryOptions, trpcOptions] = splitUserOptions(optionsFn?.());
						const key = getQueryKeyInternal(path, input, 'query');
						return {
							...queryOptions,
							enabled: !browser ? false : queryOptions.enabled,
							queryKey: key,
							queryFn: () => client.query(joinedPath, input, trpcOptions),
						} as UndefinedInitialDataOptions;
					});
				}
				case 'mutation': {
					const optionsFn = args[0] as
						| (() => UserExposedOptions<CreateMutationOptions>)
						| undefined;

					return createMutation(() => {
						const [queryOptions, trpcOptions] = splitUserOptions(optionsFn?.());
						const key = getQueryKeyInternal(path, undefined, 'any');
						return {
							...queryOptions,
							mutationKey: key,
							mutationFn: (variables) => client.mutation(joinedPath, variables, trpcOptions),
						};
					});
				}
				case 'infiniteQuery': {
					const inputFn = args[0] as () => object;
					const optionsFn = args[1] as () => UserExposedOptions<CreateInfiniteQueryOptions>;

					return createInfiniteQuery(() => {
						const input = inputFn();
						const [queryOptions, trpcOptions] = splitUserOptions(optionsFn?.());
						const key = getQueryKeyInternal(path, input, 'infinite');
						return {
							...queryOptions,
							enabled: !browser ? false : queryOptions.enabled,
							queryKey: key,
							queryFn: (context) =>
								client.query(joinedPath, { ...input, cursor: context.pageParam }, trpcOptions),
						};
					});
				}
				default: {
					// path looks something like trpc.some.query.utils.invalidate,
					// so the 2nd last (now last) should be 'utils'
					if (path[path.length - 1] === 'utils') {
						return callUtilMethod(client, queryClient, path, method as any, args);
					}
					throw new TypeError(`trpc.${joinedPath}.${method} is not a function`);
				}
			}
		});
	});
}

/**
 * @internal
 */
type CreateTRPCSvelteOptions<TRouter extends AnyTRPCRouter> = CreateTRPCClientOptions<TRouter> & {
	queryClientConfig?: QueryClientConfig;
};

export function createTRPCSvelte<TRouter extends AnyTRPCRouter>(
	opts: CreateTRPCSvelteOptions<TRouter>,
): CreateTRPCSvelte<TRouter> {
	const client = createTRPCUntypedClient<TRouter>(opts);

	const proxy = createSvelteInternalProxy(client, opts);

	return proxy as any;
}
