import { RequestEvent, RequestHandler, error } from '@sveltejs/kit';
import {
	AnyProcedure,
	AnyQueryProcedure,
	AnyRouter,
	ProcedureRouterRecord,
	ProtectedIntersection,
	inferProcedureInput,
} from '@trpc/server';
import {
	HTTPBaseHandlerOptions,
	getHTTPStatusCodeFromError,
} from '@trpc/server/http';
import {
	createFlatProxy,
	createRecursiveProxy,
	inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import { parseSSRArgs } from '../utils/parseSsrArgs';
import { SvelteCreateContextOption, svelteRequestHandler } from './handler';
import {
	RequestEventLocals,
	TRPCSSRData,
	getSSRData,
	localsSymbol,
} from './utils';

type DecorateProcedure<TProcedure extends AnyProcedure> =
	TProcedure extends AnyQueryProcedure
		? (inferProcedureInput<TProcedure> extends void
				? {
						ssr: (
							event: RequestEvent,
						) => Promise<
							inferTransformedProcedureOutput<TProcedure> | undefined
						>;
				  }
				: {
						ssr: (
							input: inferProcedureInput<TProcedure>,
							event: RequestEvent,
						) => Promise<
							inferTransformedProcedureOutput<TProcedure> | undefined
						>;
				  }) &
				(inferProcedureInput<TProcedure> extends { cursor?: any }
					? {
							ssrInfinite: (
								input: inferProcedureInput<TProcedure>,
								event: RequestEvent,
							) => Promise<
								inferTransformedProcedureOutput<TProcedure> | undefined
							>;
					  }
					: object)
		: never;

type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
	[TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
		? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
		: TProcedures[TKey] extends AnyProcedure
		? DecorateProcedure<TProcedures[TKey]>
		: never;
};

type TRPCSvelteServerBase<_TRouter extends AnyRouter> = {
	hydrateToClient: (event: RequestEvent) => Promise<TRPCSSRData>;
	handler: RequestHandler;
};

export type TRPCSvelteServer<TRouter extends AnyRouter> = ProtectedIntersection<
	TRPCSvelteServerBase<TRouter>,
	DecoratedProcedureRecord<TRouter['_def']['record']>
>;

export type CreateTRPCSvelteServerOptions<TRouter extends AnyRouter> =
	HTTPBaseHandlerOptions<TRouter, Request> &
		SvelteCreateContextOption<TRouter> & {
			endpoint: string;
		};

const clientMethods = {
	ssr: 'query',
	ssrInfinite: 'infinite',
} as const;

function createInternalProxy<TRouter extends AnyRouter>(
	options: CreateTRPCSvelteServerOptions<TRouter>,
) {
	return createFlatProxy<TRPCSvelteServer<TRouter>>((firstPath) => {
		switch (firstPath) {
			case 'handler':
				return (event: RequestEvent) => svelteRequestHandler(options, event);
			case 'hydrateToClient':
				return getSSRData;
		}

		return createRecursiveProxy(({ path, args }) => {
			path.unshift(firstPath);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const method = path.pop()!;
			const fullPath = path.join('.');

			const procedureType = clientMethods[method as keyof typeof clientMethods];

			if (!procedureType) {
				throw new TypeError(`trpc.${fullPath}.${method} is not a function`);
			}

			const procedure = options.router._def.procedures[
				fullPath
			] as AnyQueryProcedure;

			const [rawInput, event] = parseSSRArgs(args);

			const createContext = async () => {
				return options.createContext?.(event);
			};

			const key = getArrayQueryKey(path, rawInput, procedureType);

			createContext()
				.then((ctx) =>
					procedure({
						ctx,
						rawInput,
						path: fullPath,
						type: 'query',
					}),
				)
				.then(async (result) => {
					const locals = event.locals as RequestEventLocals;

					if (!locals[localsSymbol]) {
						locals[localsSymbol] = new Map();
					}
					locals[localsSymbol].set(key, result);

					return result;
				})
				.catch((err) => {
					if (err.name === 'TRPCError') {
						const httpCode = getHTTPStatusCodeFromError(err);
						if (httpCode === 500) throw err;

						throw error(httpCode, err.message);
					} else {
						throw err;
					}
				});
		});
	});
}

export function createTRPCSvelteServer<TRouter extends AnyRouter>(
	options: CreateTRPCSvelteServerOptions<TRouter>,
): TRPCSvelteServer<TRouter> {
	const proxy = createInternalProxy(options);
	return proxy;
}
