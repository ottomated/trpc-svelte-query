import { getRequestEvent } from '$app/server';
import {
	type RequestEvent,
	type RequestHandler,
	type ServerLoadEvent,
	error,
} from '@sveltejs/kit';
import { type InfiniteData, hashKey } from '@tanstack/svelte-query';
import { createTRPCFlatProxy, createTRPCRecursiveProxy } from '@trpc/server';
import type {
	AnyTRPCProcedure,
	AnyTRPCQueryProcedure,
	AnyTRPCRootTypes,
	AnyTRPCRouter,
	TRPCRouterRecord,
	inferProcedureInput,
	inferTransformedProcedureOutput,
} from '@trpc/server';
import {
	type HTTPBaseHandlerOptions,
	getHTTPStatusCodeFromError,
} from '@trpc/server/http';
import type { ProtectedIntersection } from '@trpc/server/unstable-core-do-not-import';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import {
	type SvelteCreateContextOption,
	svelteRequestHandler,
} from './handler';
import {
	type RequestEventLocals,
	type TRPCSSRData,
	TRPC_SSR_DATA,
	hydrateToClient,
} from './utils';

type DecorateProcedure<TDef extends { input: any; output: any }> =
	(TDef['input'] extends void
		? {
				/**
				 * Preload the data for use on the page. You **don't** need
				 * to use the output of this function. If the TRPC procedure
				 * throws an error, this will throw a SvelteKit-friendly error.
				 */
				ssr: () => Promise<TDef['output'] | undefined>;
		  }
		: {
				/**
				 * Preload the data for use on the page. You **don't** need
				 * to use the output of this function. If the TRPC procedure
				 * throws an error, this will throw a SvelteKit-friendly error.
				 */
				ssr: (input: TDef['input']) => Promise<TDef['output'] | undefined>;
		  }) &
		(TDef['input'] extends { cursor?: any }
			? {
					/**
					 * Preload the data for use on the page. You **don't** need
					 * to use the output of this function. If the TRPC procedure
					 * throws an error, this will throw a SvelteKit-friendly error.
					 */
					ssrInfinite: (
						input: TDef['input'],
					) => Promise<TDef['output'] | undefined>;
			  }
			: object);

type DecorateRouterRecord<
	TRoot extends AnyTRPCRootTypes,
	TRecord extends TRPCRouterRecord,
> = {
	// filter out mutations
	[TKey in keyof TRecord as TRecord[TKey] extends infer $Value
		? $Value extends AnyTRPCProcedure
			? $Value['_def']['type'] extends 'query'
				? TKey
				: never
			: TKey
		: never]: TRecord[TKey] extends infer $Value
		? $Value extends AnyTRPCProcedure
			? $Value['_def']['type'] extends 'query'
				? DecorateProcedure<{
						input: inferProcedureInput<$Value>;
						output: inferTransformedProcedureOutput<TRoot, $Value>;
				  }>
				: never
			: $Value extends TRPCRouterRecord
			? DecorateRouterRecord<TRoot, $Value>
			: never
		: never;
};

type TRPCSvelteServerBase = {
	hydrateToClient: (event: ServerLoadEvent) => TRPCSSRData;
	handler: RequestHandler;
};

export type TRPCSvelteServer<TRouter extends AnyTRPCRouter> =
	ProtectedIntersection<
		TRPCSvelteServerBase,
		DecorateRouterRecord<
			TRouter['_def']['_config']['$types'],
			TRouter['_def']['record']
		>
	>;

export type CreateTRPCSvelteServerOptions<TRouter extends AnyTRPCRouter> =
	HTTPBaseHandlerOptions<TRouter, Request> &
		SvelteCreateContextOption<TRouter> & {
			endpoint: string;
		};

const clientMethods = {
	ssr: 'query',
	ssrInfinite: 'infinite',
} as const;

export function createTRPCSvelteServer<TRouter extends AnyTRPCRouter>(
	options: CreateTRPCSvelteServerOptions<TRouter>,
): TRPCSvelteServer<TRouter> {
	return createTRPCFlatProxy<TRPCSvelteServer<TRouter>>((firstPath) => {
		switch (firstPath) {
			case 'handler':
				return (event: RequestEvent) => svelteRequestHandler(options, event);
			case 'hydrateToClient':
				return hydrateToClient;
		}

		return createTRPCRecursiveProxy(({ path: rawPath, args }) => {
			const path = [firstPath as string, ...rawPath];

			const method = path.pop()!;
			const fullPath = path.join('.');

			const procedureType = clientMethods[method as keyof typeof clientMethods];

			if (!procedureType) {
				throw new TypeError(
					`trpc.${fullPath}.${String(method)} is not a function`,
				);
			}

			const procedure = options.router._def.procedures[
				fullPath
			] as AnyTRPCQueryProcedure;

			if (!procedure) {
				throw new TypeError(`trpc.${fullPath} is not a function`);
			}

			const event = getRequestEvent();

			const createContext = async () => {
				return options.createContext?.(event);
			};

			return createContext()
				.then((ctx) =>
					procedure({
						ctx,
						getRawInput: async () => args[0],
						path: fullPath,
						type: 'query',
						signal: undefined,
					}),
				)
				.then(async (result) => {
					const locals = event.locals as RequestEventLocals;

					if (!(TRPC_SSR_DATA in locals)) {
						locals[TRPC_SSR_DATA] = new Map();
					}
					const key = getArrayQueryKey(path, args[0], procedureType);
					if (procedureType === 'query') {
						locals[TRPC_SSR_DATA]!.set(key, result);
					} else {
						// infinite query
						const hash = hashKey(key);
						let previousData: InfiniteData<any, any> | undefined;
						for (const [key, data] of locals[TRPC_SSR_DATA]!) {
							if (hashKey(key) === hash) {
								previousData = data as any;
								break;
							}
						}
						const existed = previousData !== undefined;
						previousData ??= {
							pages: [],
							pageParams: [],
						};
						previousData.pages.push(result);
						previousData.pageParams.push((args[0] as { cursor?: any }).cursor);
						if (!existed) {
							locals[TRPC_SSR_DATA]!.set(key, previousData);
						}
					}

					return result;
				})
				.catch((err) => {
					if (err.name === 'TRPCError') {
						const httpCode = getHTTPStatusCodeFromError(err);
						if (httpCode === 500) throw err;

						error(httpCode, { message: err.message });
					} else {
						throw err;
					}
				});
		});
	});
}
