import type { RequestEvent } from '@sveltejs/kit';
import type { AnyTRPCRouter, inferRouterContext } from '@trpc/server';
import { resolveResponse } from '@trpc/server/http';
import type { CreateTRPCSvelteServerOptions } from './createTRPCSvelteServer';

export type SvelteCreateContextFn<TRouter extends AnyTRPCRouter> = (
	event: RequestEvent,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

/**
 * @internal
 */
export type SvelteCreateContextOption<TRouter extends AnyTRPCRouter> =
	unknown extends inferRouterContext<TRouter>
		? {
				/**
				 * @link https://trpc.io/docs/context
				 **/
				createContext?: SvelteCreateContextFn<TRouter>;
			}
		: {
				/**
				 * @link https://trpc.io/docs/context
				 **/
				createContext: SvelteCreateContextFn<TRouter>;
			};

export async function svelteRequestHandler<TRouter extends AnyTRPCRouter>(
	opts: CreateTRPCSvelteServerOptions<TRouter>,
	event: RequestEvent,
) {
	const createContext = async () => {
		return opts.createContext?.(event);
	};

	const url = new URL(event.request.url);
	const path = url.pathname.slice(opts.endpoint.length + 1);

	const result = await resolveResponse({
		req: event.request,
		createContext,
		path,
		router: opts.router,
		allowBatching: opts.allowBatching,
		responseMeta: opts.responseMeta,
		error: null,
		onError(o) {
			opts?.onError?.({ ...o, req: event.request });
		},
	});

	return result;
}
