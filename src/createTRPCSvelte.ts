import {
	CreateInfiniteQueryOptions,
	CreateInfiniteQueryResult,
	CreateMutationOptions,
	CreateMutationResult,
	CreateQueryOptions,
	CreateQueryResult,
	InfiniteData,
	QueryClient,
	QueryClientConfig,
	StoreOrVal,
	UndefinedInitialDataOptions,
	createInfiniteQuery,
	createMutation,
	createQuery,
} from '@tanstack/svelte-query';
import {
	CreateTRPCClientOptions,
	TRPCClientErrorLike,
	TRPCRequestOptions,
	TRPCUntypedClient,
	createTRPCUntypedClient,
} from '@trpc/client';
import type {
	AnyMutationProcedure,
	AnyProcedure,
	AnyQueryProcedure,
	AnyRouter,
	ProcedureRouterRecord,
	ProtectedIntersection,
	inferProcedureInput,
} from '@trpc/server';
import {
	createFlatProxy,
	createRecursiveProxy,
	inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { BROWSER } from 'esm-env';
import { Readable, derived, readable } from 'svelte/store';
import { QueryKey, getArrayQueryKey } from './internals/getArrayQueryKey';
import type { TRPCSSRData } from './server/utils';
import {
	DecorateProcedureUtils,
	DecorateRouterUtils,
	callUtilMethod,
} from './shared';
import { isSvelteStore } from './utils/isSvelteStore';
import { splitUserOptions } from './utils/splitUserOptions';

/**
 * Options passed to @tanstack/svelte-query that are exposed to the user
 * @internal
 */
export type UserExposedTanstackQueryOptions<TOptions> = Omit<
	TOptions,
	'queryFn' | 'queryKey' | 'mutationFn' | 'mutationKey'
>;

type inferStoreOrVal<TStore> = TStore extends StoreOrVal<infer U> ? U : TStore;

/**
 * @internal
 */
export type UserExposedOptions<TOptions> =
	UserExposedTanstackQueryOptions<TOptions> & TRPCRequestOptions;

type DecorateProcedure<TProcedure extends AnyProcedure> =
	TProcedure extends AnyQueryProcedure
		? {
				query: <TData = inferTransformedProcedureOutput<TProcedure>>(
					input: StoreOrVal<inferProcedureInput<TProcedure>>,
					options?: StoreOrVal<
						UserExposedOptions<
							CreateQueryOptions<
								inferTransformedProcedureOutput<TProcedure>,
								TRPCClientErrorLike<TProcedure>,
								TData,
								QueryKey
							>
						>
					>,
				) => CreateQueryResult<TData, TRPCClientErrorLike<TProcedure>>;
		  } & (inferProcedureInput<TProcedure> extends { cursor?: infer TCursor }
				? {
						infiniteQuery: <
							TData = InfiniteData<
								inferTransformedProcedureOutput<TProcedure>,
								TCursor
							>,
						>(
							input: StoreOrVal<
								Omit<inferProcedureInput<TProcedure>, 'cursor'>
							>,
							options: StoreOrVal<
								UserExposedOptions<
									CreateInfiniteQueryOptions<
										inferTransformedProcedureOutput<TProcedure>,
										TRPCClientErrorLike<TProcedure>,
										TData,
										inferTransformedProcedureOutput<TProcedure>,
										QueryKey,
										TCursor
									>
								>
							>,
						) => CreateInfiniteQueryResult<
							TData,
							TRPCClientErrorLike<TProcedure>
						>;
				  }
				: object)
		: TProcedure extends AnyMutationProcedure
		? {
				mutation: <TContext = unknown>(
					opts?: StoreOrVal<
						UserExposedOptions<
							inferStoreOrVal<
								CreateMutationOptions<
									inferTransformedProcedureOutput<TProcedure>,
									TRPCClientErrorLike<TProcedure>,
									inferProcedureInput<TProcedure>,
									TContext
								>
							>
						>
					>,
				) => CreateMutationResult<
					inferTransformedProcedureOutput<TProcedure>,
					TRPCClientErrorLike<TProcedure>,
					inferProcedureInput<TProcedure>,
					TContext
				>;
		  }
		: never;

type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
	[TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
		? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
		: TProcedures[TKey] extends AnyProcedure
		? DecorateProcedure<TProcedures[TKey]> &
				DecorateProcedureUtils<TProcedures[TKey]>
		: never;
} & DecorateRouterUtils;

/**
 * @internal
 */
export type CreateTRPCSvelteBase<_TRouter extends AnyRouter> = {
	queryClient: QueryClient;
	hydrateFromServer: (data: TRPCSSRData) => QueryClient;
};

export type CreateTRPCSvelte<TRouter extends AnyRouter> = ProtectedIntersection<
	CreateTRPCSvelteBase<TRouter>,
	DecoratedProcedureRecord<TRouter['_def']['record']>
>;

const clientMethods = {
	query: [1, 'query'],
	mutation: [0, 'any'],
	infiniteQuery: [1, 'infinite'],
} as const;

type ClientMethod = keyof typeof clientMethods;

function createSvelteInternalProxy<TRouter extends AnyRouter>(
	client: TRPCUntypedClient<TRouter>,
	opts: CreateTRPCSvelteOptions<TRouter>,
) {
	let queryClient: QueryClient;
	if (BROWSER) {
		queryClient = new QueryClient(opts.queryClientConfig);
	}

	return createFlatProxy<CreateTRPCSvelte<TRouter>>((firstPath) => {
		switch (firstPath) {
			case 'queryClient': {
				// if (BROWSER) {
				return queryClient;
				// } else {
				// 	throw new Error('`trpc.queryClient` is only available on the client');
				// }
			}
			case 'hydrateFromServer': {
				return (data: TRPCSSRData) => {
					let client = queryClient;
					if (!BROWSER) {
						client = new QueryClient(opts.queryClientConfig);
					}
					for (const [key, value] of data) {
						client.setQueryData(key, value);
					}
					return client;
				};
			}
		}

		return createRecursiveProxy(({ path, args: unknownArgs }) => {
			path.unshift(firstPath);

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
			const options = args[optionIndex] as UserExposedOptions<any> | undefined;

			const optionsStore =
				options && isSvelteStore(options) ? options : readable(options ?? {});

			const inputStore =
				// Mutation doesn't have input
				method === 'mutation'
					? undefined
					: // If it's a store, use it
					args[0] && isSvelteStore(args[0])
					? args[0]
					: // wrap the input in a store
					  readable(args[0]);

			// Create the query key - input is undefined for mutations

			switch (method) {
				case 'query': {
					type Options = inferStoreOrVal<UndefinedInitialDataOptions>;
					const options = derived(
						[
							inputStore!,
							optionsStore as Readable<UserExposedOptions<Options>>,
						],
						([$input, $options]) => {
							const [queryOptions, trpcOptions] = splitUserOptions($options);
							const key = getArrayQueryKey(path, $input, queryType);
							return {
								...queryOptions,
								enabled: queryOptions.enabled !== false && BROWSER,
								queryKey: key,
								queryFn: () => client.query(joinedPath, $input, trpcOptions),
							} as Options;
						},
					);
					return createQuery(options);
				}
				case 'mutation': {
					type Options = inferStoreOrVal<CreateMutationOptions>;
					const options = derived(
						optionsStore as Readable<UserExposedOptions<Options>>,
						($options) => {
							const [queryOptions, trpcOptions] = splitUserOptions($options);
							const key = getArrayQueryKey(path, undefined, queryType);
							return {
								...queryOptions,
								mutationKey: key,
								mutationFn: (variables) =>
									client.mutation(joinedPath, variables, trpcOptions),
							} as Options;
						},
					);
					return createMutation(options);
				}
				case 'infiniteQuery': {
					type Options = inferStoreOrVal<CreateInfiniteQueryOptions>;
					const options = derived(
						[
							inputStore!,
							optionsStore as Readable<UserExposedOptions<Options>>,
						],
						([$input, $options]) => {
							const [queryOptions, trpcOptions] = splitUserOptions($options);
							const key = getArrayQueryKey(path, $input, queryType);
							return {
								...queryOptions,
								enabled: queryOptions.enabled !== false && BROWSER,
								queryKey: key,
								queryFn: (context) => {
									const input = { ...$input, cursor: context.pageParam };
									return client.query(joinedPath, input, trpcOptions);
								},
							} as Options;
						},
					);
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
type CreateTRPCSvelteOptions<TRouter extends AnyRouter> =
	CreateTRPCClientOptions<TRouter> & {
		queryClientConfig?: QueryClientConfig;
	};

export function createTRPCSvelte<TRouter extends AnyRouter>(
	opts: CreateTRPCSvelteOptions<TRouter>,
): CreateTRPCSvelte<TRouter> {
	const client = createTRPCUntypedClient<TRouter>(opts);

	const proxy = createSvelteInternalProxy(client, opts);

	return proxy as any;
}
