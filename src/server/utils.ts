import type { RequestEvent } from '@sveltejs/kit';
import type { QueryKey } from '@tanstack/svelte-query';

/**
 * @internal
 */
export const localsSymbol = Symbol('trpcSSRData');

/**
 * @internal
 */
export type RequestEventLocals = {
	[localsSymbol]: TRPCSSRData;
};

/**
 * @internal
 */
export type TRPCSSRData = Map<QueryKey, unknown>;

/**
 * @internal
 */
export function getSSRData(event: RequestEvent) {
	event.url.pathname;
	const locals = event.locals as RequestEventLocals;
	if (!locals[localsSymbol]) {
		const m = new Map();
		locals[localsSymbol] = m;
		return m;
	}

	return locals[localsSymbol];
}
