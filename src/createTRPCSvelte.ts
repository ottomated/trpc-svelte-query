import {
	CreateInfiniteQueryOptions,
	CreateInfiniteQueryResult,
	CreateMutationOptions,
	CreateMutationResult,
	CreateQueryOptions,
	CreateQueryResult,
	QueryClient,
	QueryClientConfig,
	QueryKey,
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
import {
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
import { getArrayQueryKey } from './internals/getArrayQueryKey';
import {
	DecorateProcedureUtils,
	DecorateRouterUtils,
	callUtilMethod,
} from './shared';
import {
	SveltekitRequestEventInput,
	TRPCSSRData,
	getSSRData,
	localsSymbol,
	parseSSRArgs,
} from './ssr';
import { splitUserOptions } from './utils/splitUserOptions';

/**
 * @internal
 */
export type TodoTypeName<TOptions> = Omit<
	TOptions,
	'queryFn' | 'queryKey' | 'mutationFn' | 'mutationKey'
>;

/**
 * @internal
 */
export type UserExposedOptions<TOptions> = TodoTypeName<TOptions> &
	TRPCRequestOptions;

type DecorateProcedure<TProcedure extends AnyProcedure> =
	TProcedure extends AnyQueryProcedure
		? {
				query: (
					input: inferProcedureInput<TProcedure>,
					options?: UserExposedOptions<
						CreateQueryOptions<
							inferTransformedProcedureOutput<TProcedure>,
							TRPCClientErrorLike<TProcedure>
						>
					>,
				) => CreateQueryResult<
					inferTransformedProcedureOutput<TProcedure>,
					TRPCClientErrorLike<TProcedure>
				>;
		  } & (inferProcedureInput<TProcedure> extends void
				? {
						ssr: (
							event: SveltekitRequestEventInput,
							options?: TRPCRequestOptions,
						) => Promise<
							inferTransformedProcedureOutput<TProcedure> | undefined
						>;
				  }
				: {
						ssr: (
							input: inferProcedureInput<TProcedure>,
							event: SveltekitRequestEventInput,
							options?: TRPCRequestOptions,
						) => Promise<
							inferTransformedProcedureOutput<TProcedure> | undefined
						>;
				  }) &
				(inferProcedureInput<TProcedure> extends { cursor?: any }
					? {
							infiniteQuery: (
								input: Omit<inferProcedureInput<TProcedure>, 'cursor'>,
								options?: UserExposedOptions<
									CreateInfiniteQueryOptions<
										inferTransformedProcedureOutput<TProcedure>,
										TRPCClientErrorLike<TProcedure>
									>
								>,
							) => CreateInfiniteQueryResult<
								inferTransformedProcedureOutput<TProcedure>,
								TRPCClientErrorLike<TProcedure>
							>;
							ssrInfinite: (
								input: inferProcedureInput<TProcedure>,
								event: SveltekitRequestEventInput,
								options?: TRPCRequestOptions,
							) => Promise<
								inferTransformedProcedureOutput<TProcedure> | undefined
							>;
					  }
					: object)
		: TProcedure extends AnyMutationProcedure
		? {
				mutation: <TContext = unknown>(
					opts?: UserExposedOptions<
						CreateMutationOptions<
							inferTransformedProcedureOutput<TProcedure>,
							TRPCClientErrorLike<TProcedure>,
							inferProcedureInput<TProcedure>,
							TContext
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
	ssr: typeof getSSRData;
	hydrateQueryClient: (data: TRPCSSRData) => QueryClient;
};

export type CreateTRPCSvelte<TRouter extends AnyRouter> = ProtectedIntersection<
	CreateTRPCSvelteBase<TRouter>,
	DecoratedProcedureRecord<TRouter['_def']['record']>
>;

const clientMethods = {
	query: [1, 'query'],
	mutation: [0, 'any'],
	infiniteQuery: [1, 'infinite'],
	ssr: [-1, 'query'],
	ssrInfinite: [-1, 'infinite'],
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
				if (BROWSER) {
					return queryClient;
				} else {
					throw new Error('`trpc.queryClient` is only available on the client');
				}
			}
			case 'ssr':
				if (BROWSER) {
					throw new Error('`trpc.ssr` is only available on the server');
				} else {
					return getSSRData;
				}
			case 'hydrateQueryClient': {
				return (data: TRPCSSRData) => {
					let client = queryClient;
					if (!BROWSER) {
						client = new QueryClient(opts.queryClientConfig);
					}
					for (const [key, value] of data.entries()) {
						client.setQueryData(key, value);
					}
					return client;
				};
			}
		}

		return createRecursiveProxy(({ path, args: unknownArgs }) => {
			path.unshift(firstPath);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
			const [trpcOptions, tanstackQueryOptions] = splitUserOptions(options);

			// Create the query key - input is undefined for mutations
			const key = (
				method === 'ssr'
					? undefined
					: getArrayQueryKey(
							path,
							method === 'mutation' ? undefined : args[0],
							queryType,
					  )
			) as QueryKey;

			const enabled = tanstackQueryOptions?.enabled !== false && BROWSER;

			switch (method) {
				case 'query':
					return createQuery({
						...tanstackQueryOptions,
						enabled,
						queryKey: key,
						queryFn: () => client.query(joinedPath, args[0], trpcOptions),
					});
				case 'mutation': {
					return createMutation({
						...tanstackQueryOptions,
						mutationKey: key,
						mutationFn: (variables: any) =>
							client.mutation(joinedPath, variables, trpcOptions),
					});
				}
				case 'infiniteQuery':
					return createInfiniteQuery({
						...tanstackQueryOptions,
						enabled,
						queryKey: key,
						queryFn: (context) => {
							const input = { ...args[0], cursor: context.pageParam };
							return client.query(joinedPath, input, trpcOptions);
						},
					});
				case 'ssr':
				case 'ssrInfinite':
					if (BROWSER) {
						throw new TypeError(
							`\`trpc.${joinedPath}.ssr\` is only available on the server`,
						);
					} else {
						const [input, event, options] = parseSSRArgs(args);
						if (event.isDataRequest) return;

						const key = getArrayQueryKey(path, input, queryType);

						return client
							.query(joinedPath, input, {
								...options,
								context: {
									...options?.context,
									fetch: event.fetch,
								},
							})
							.then((data) => {
								if (!event.locals[localsSymbol]) {
									event.locals[localsSymbol] = new Map();
								}
								event.locals[localsSymbol].set(key, data);
								return data;
							});
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

	// const hooks = createHooksInternal<TRouter, TSSRContext>(opts);
	// const proxy = createHooksInternalProxy<TRouter, TSSRContext, TFlags>(hooks);

	// return proxy as any;
}
