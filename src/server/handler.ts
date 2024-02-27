import type { RequestEvent } from '@sveltejs/kit';
import { AnyRouter, inferRouterContext } from '@trpc/server';
import { HTTPRequest, resolveHTTPResponse } from '@trpc/server/http';
import { CreateTRPCSvelteServerOptions } from './createTRPCSvelteServer';

export type SvelteCreateContextFn<TRouter extends AnyRouter> = (
	event: RequestEvent,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

/**
 * @internal
 */
export type SvelteCreateContextOption<TRouter extends AnyRouter> =
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

export async function svelteRequestHandler<TRouter extends AnyRouter>(
	opts: CreateTRPCSvelteServerOptions<TRouter>,
	event: RequestEvent,
) {
	const resHeaders = new Headers();

	const createContext = async () => {
		return opts.createContext?.(event);
	};

	const request = event.request;
	const url = new URL(request.url);
	const path = url.pathname.slice(opts.endpoint.length + 1);
	const req: HTTPRequest = {
		query: url.searchParams,
		method: request.method,
		headers: Object.fromEntries(request.headers),
		body:
			request.headers.get('content-type') === 'application/json'
				? await request.text()
				: '',
	};

	const result = await resolveHTTPResponse({
		req,
		createContext,
		path,
		router: opts.router,
		batching: opts.batching,
		responseMeta: opts.responseMeta,
		onError(o) {
			opts?.onError?.({ ...o, req: event.request });
		},
	});

	for (const [key, value] of Object.entries(result.headers ?? {})) {
		/* istanbul ignore if -- @preserve */
		if (typeof value === 'undefined') {
			continue;
		}

		if (typeof value === 'string') {
			resHeaders.set(key, value);
			continue;
		}

		for (const v of value) {
			resHeaders.append(key, v);
		}
	}

	return new Response(result.body, {
		status: result.status,
		headers: resHeaders,
	});
}
