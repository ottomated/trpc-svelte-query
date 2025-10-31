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
import {
	type TRPCQueryKey,
	getArrayQueryKey,
} from './internals/getArrayQueryKey';
import type { TRPCSSRData } from './server/utils';
import {
	type DecorateRouterUtils,
	type InfiniteQueryUtils,
	type QueryUtils,
	type ResolverDef,
	callUtilMethod,
} from './shared/utils';
import { splitUserOptions } from './utils/splitUserOptions';

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
export type UserExposedOptions<TOptions> =
	UserExposedTanstackQueryOptions<TOptions> & TRPCRequestOptions;

type DecorateProcedure<
	TType extends TRPCProcedureType,
	TDef extends ResolverDef,
> = TType extends 'query'
	? {
			query: <TData = TDef['output']>(
				input: TDef['input'],
				options?: UserExposedOptions<
					CreateQueryOptions<
						TDef['output'],
						TRPCClientErrorLike<TDef>,
						TData,
						TRPCQueryKey
					>
				>,
			) => CreateQueryResult<TData, TRPCClientErrorLike<TDef>>;
			utils: QueryUtils<TDef>;
		} & (TDef['input'] extends { cursor?: infer TCursor }
			? {
					infiniteQuery: <TData = InfiniteData<TDef['output'], TCursor>>(
						input: Omit<TDef['input'], 'cursor'>,
						options: UserExposedOptions<
							CreateInfiniteQueryOptions<
								TDef['output'],
								TRPCClientErrorLike<TDef>,
								TData,
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
					opts?: UserExposedOptions<
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

type DecorateRouterRecord<
	TRoot extends AnyTRPCRootTypes,
	TRecord extends TRPCRouterRecord,
> = {
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

export type CreateTRPCSvelte<TRouter extends AnyTRPCRouter> =
	ProtectedIntersection<
		CreateTRPCSvelteBase,
		DecorateRouterRecord<
			TRouter['_def']['_config']['$types'],
			TRouter['_def']['record']
		>
	>;

const clientMethods = {
	query: [1, 'query'],
	mutation: [0, 'any'],
	infiniteQuery: [1, 'infinite'],
} as const;

type ClientMethod = keyof typeof clientMethods;

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

		return createTRPCRecursiveProxy(({ path: rawPath, args: unknownArgs }) => {
			const path = [firstPath as string, ...rawPath];

			const method = path.pop()! as ClientMethod;
			const joinedPath = path.join('.');

			// Pull the query options out of the args - it's at a different index based on the method
			const methodData = clientMethods[method];
			if (!methodData) {
				const utils = path.pop();
				if (utils === 'utils') {
					return callUtilMethod(
						client,
						queryClient,
						path,
						method as any,
						unknownArgs,
					);
				}
				throw new TypeError(`trpc.${joinedPath}.${method} is not a function`);
			}
			const args = unknownArgs as any[];

			const [optionIndex, queryType] = methodData;
			const requestOptions = args[optionIndex] as
				| UserExposedOptions<any>
				| undefined;

			const requestInput =
				// Mutation doesn't have input
				method === 'mutation' ? undefined : args[0];

			// Create the query key - input is undefined for mutations

			switch (method) {
				case 'query': {
					const options = () => {
						const [queryOptions, trpcOptions] =
							splitUserOptions(requestOptions);
						const key = getArrayQueryKey(path, requestInput, queryType);
						return {
							...queryOptions,
							enabled: queryOptions?.enabled !== false && browser,
							queryKey: key,
							queryFn: () =>
								client.query(joinedPath, requestInput, trpcOptions),
						} as UndefinedInitialDataOptions;
					};
					return createQuery(options);
				}
				case 'mutation': {
					const options = () => {
						const [queryOptions, trpcOptions] =
							splitUserOptions(requestOptions);
						const key = getArrayQueryKey(path, undefined, queryType);
						return {
							...queryOptions,
							mutationKey: key,
							mutationFn: (variables) =>
								client.mutation(joinedPath, variables, trpcOptions),
						} as CreateMutationOptions;
					};
					return createMutation(options);
				}
				case 'infiniteQuery': {
					const options = () => {
						const [queryOptions, trpcOptions] =
							splitUserOptions(requestOptions);
						const key = getArrayQueryKey(path, requestInput, queryType);
						return {
							...queryOptions,
							enabled: queryOptions?.enabled !== false && browser,
							queryKey: key,
							queryFn: (context) => {
								const input = { ...requestInput, cursor: context.pageParam };
								return client.query(joinedPath, input, trpcOptions);
							},
							getNextPageParam: queryOptions?.getNextPageParam,
							initialPageParam: queryOptions?.initialPageParam,
						} as CreateInfiniteQueryOptions;
					};
					return createInfiniteQuery(options);
				}
				default:
					throw new TypeError(`trpc.${joinedPath}.${method} is not a function`);
			}
		});
	});
}

/**
 * @internal
 */
type CreateTRPCSvelteOptions<TRouter extends AnyTRPCRouter> =
	CreateTRPCClientOptions<TRouter> & {
		queryClientConfig?: QueryClientConfig;
	};

export function createTRPCSvelte<TRouter extends AnyTRPCRouter>(
	opts: CreateTRPCSvelteOptions<TRouter>,
): CreateTRPCSvelte<TRouter> {
	const client = createTRPCUntypedClient<TRouter>(opts);

	const proxy = createSvelteInternalProxy(client, opts);

	return proxy as any;
}
