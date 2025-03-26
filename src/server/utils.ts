import type { RequestEvent } from '@sveltejs/kit';
import type { QueryKey } from '@tanstack/svelte-query';

/**
 * @internal
 */
export const TRPC_SSR_DATA = Symbol('trpcSSRData');

/**
 * @internal
 */
export type RequestEventLocals = {
	[TRPC_SSR_DATA]?: TRPCSSRData;
};

/**
 * @internal
 */
export type TRPCSSRData = Map<QueryKey, unknown>;

/**
 * @internal
 */
export function hydrateToClient(
	event: RequestEvent & { locals: RequestEventLocals },
) {
	// const event = getRequestEvent() as RequestEvent & {
	// 	locals: RequestEventLocals;
	// };
	// re-run when pathname changes
	event.url.pathname;
	if (!(TRPC_SSR_DATA in event.locals)) {
		const m = new Map();
		event.locals[TRPC_SSR_DATA] = m;
		return m;
	}

	return event.locals[TRPC_SSR_DATA];
}
