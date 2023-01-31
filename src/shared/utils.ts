import {
	CancelOptions,
	FetchInfiniteQueryOptions,
	FetchQueryOptions,
	InfiniteData,
	InvalidateOptions,
	InvalidateQueryFilters,
	QueryClient,
	QueryFilters,
	QueryFunction,
	RefetchOptions,
	RefetchQueryFilters,
	ResetOptions,
	ResetQueryFilters,
	SetDataOptions,
	Updater,
	useQueryClient,
} from '@tanstack/svelte-query';
import { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import {
	AnyProcedure,
	AnyQueryProcedure,
	AnyRouter,
	Procedure,
	ProcedureParams,
	inferProcedureInput,
} from '@trpc/server';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import { BROWSER } from 'esm-env';
import { UserExposedOptions } from '../createTRPCSvelte';
import { QueryType, getArrayQueryKey } from '../internals/getArrayQueryKey';
import { splitUserOptions } from '../utils/splitUserOptions';

/**
 * @internal
 */
export type DecorateProcedureUtils<TProcedure extends AnyProcedure> =
	TProcedure extends AnyQueryProcedure
		? {
				utils: {
					invalidate: <TPageData = unknown>(
						input: inferProcedureInput<TProcedure>,
						filters?: InvalidateQueryFilters<TPageData>,
						options?: InvalidateOptions,
					) => Promise<void>;
					prefetch: (
						input: inferProcedureInput<TProcedure>,
						options?: UserExposedOptions<
							FetchQueryOptions<
								inferProcedureInput<TProcedure>,
								TRPCClientErrorLike<TProcedure>
							>
						>,
					) => Promise<void>;
					fetch: (
						input: inferProcedureInput<TProcedure>,
						options?: UserExposedOptions<
							FetchQueryOptions<
								inferProcedureInput<TProcedure>,
								TRPCClientErrorLike<TProcedure>
							>
						>,
					) => Promise<inferTransformedProcedureOutput<TProcedure>>;
					refetch: <TPageData = unknown>(
						input: inferProcedureInput<TProcedure>,
						filters?: RefetchQueryFilters<TPageData>,
						options?: RefetchOptions,
					) => Promise<void>;
					cancel: (
						input: inferProcedureInput<TProcedure>,
						filters?: QueryFilters,
						options?: CancelOptions,
					) => Promise<void>;
					reset: <TPageData = unknown>(
						input: inferProcedureInput<TProcedure>,
						filters?: ResetQueryFilters<TPageData>,
						options?: ResetOptions,
					) => Promise<void>;
					setData: (
						input: inferProcedureInput<TProcedure>,
						updater: Updater<
							inferTransformedProcedureOutput<TProcedure> | undefined,
							inferTransformedProcedureOutput<TProcedure> | undefined
						>,
						options?: SetDataOptions,
					) => inferTransformedProcedureOutput<TProcedure> | undefined;
					getData: (
						input: inferProcedureInput<TProcedure>,
						filters?: QueryFilters,
					) => inferTransformedProcedureOutput<TProcedure> | undefined;
				} & (inferProcedureInput<TProcedure> extends { cursor?: any }
					? {
							prefetchInfinite: (
								input: inferProcedureInput<TProcedure>,
								options?: UserExposedOptions<
									FetchInfiniteQueryOptions<
										inferProcedureInput<TProcedure>,
										TRPCClientErrorLike<TProcedure>
									>
								>,
							) => Promise<void>;
							fetchInfinite: (
								input: inferProcedureInput<TProcedure>,
								options?: UserExposedOptions<
									FetchInfiniteQueryOptions<
										inferProcedureInput<TProcedure>,
										TRPCClientErrorLike<TProcedure>
									>
								>,
							) => Promise<
								InfiniteData<inferTransformedProcedureOutput<TProcedure>>
							>;
							getInfiniteData(
								input?: inferProcedureInput<TProcedure>,
								filters?: QueryFilters,
							):
								| InfiniteData<inferTransformedProcedureOutput<TProcedure>>
								| undefined;
							setInfiniteData(
								input: inferProcedureInput<TProcedure>,
								updater: Updater<
									inferTransformedProcedureOutput<TProcedure> | undefined,
									inferTransformedProcedureOutput<TProcedure> | undefined
								>,
								options?: SetDataOptions,
							): inferTransformedProcedureOutput<TProcedure> | undefined;
					  }
					: object);
		  }
		: object;

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
		refetch: <TPageData = unknown>(
			input?: undefined,
			filters?: RefetchQueryFilters<TPageData>,
			options?: RefetchOptions,
		) => Promise<void>;
		cancel: (
			input?: undefined,
			filters?: QueryFilters,
			options?: CancelOptions,
		) => Promise<void>;
		reset: <TPageData = unknown>(
			input?: undefined,
			filters?: ResetQueryFilters<TPageData>,
			options?: ResetOptions,
		) => Promise<void>;
	};
};

type ContextMethod = keyof DecorateProcedureUtils<
	Procedure<'query', ProcedureParams<any, any, { cursor: any }>>
>['utils'];

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

export function callUtilMethod<TRouter extends AnyRouter>(
	trpc: TRPCUntypedClient<TRouter>,
	client: QueryClient,
	path: string[],
	method: ContextMethod,
	args: any[],
): unknown {
	// If we're not in the browser, we need to use the queryClient from the context,
	// which will fail unless called during component initialization
	if (!BROWSER) {
		// This isn't a hook
		client = useQueryClient();
	}

	const queryType = queryTypes[method];
	const queryKey = getArrayQueryKey(path, args[0], queryType);

	switch (method) {
		case 'prefetch':
		case 'fetch':
		case 'prefetchInfinite':
		case 'fetchInfinite': {
			const joinedPath = path.join('.');

			const options = args[1] as UserExposedOptions<any> | undefined;
			const [trpcOptions, tanstackQueryOptions] = splitUserOptions(options);

			const queryFn: QueryFunction =
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
			return client.invalidateQueries(queryKey, args[1], args[2]);
		case 'refetch':
			return client.refetchQueries(
				getArrayQueryKey(path, args[0], 'query'),
				args[1],
				args[2],
			);
		case 'cancel':
			return client.cancelQueries(queryKey, args[1], args[2]);
		case 'reset':
			return client.resetQueries(queryKey, args[1], args[2]);
		case 'setData':
		case 'setInfiniteData':
			return client.setQueryData(queryKey, args[1], args[2]);
		case 'getData':
		case 'getInfiniteData':
			return client.getQueryData(queryKey, args[1]);
		default:
			throw new TypeError(`trpc.${path}.${method} is not a function`);
	}
}
