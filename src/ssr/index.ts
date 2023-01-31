import { QueryKey } from '@tanstack/svelte-query';
import { TRPCRequestOptions } from '@trpc/client';

/**
 * @internal
 */
export const localsSymbol = Symbol('trpcSSRData');

/**
 * @internal
 */
export type SveltekitRequestEventInput = {
	fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
	parent: () => Promise<unknown>;
	isDataRequest: boolean;
	locals: object;
};
/**
 * @internal
 */
export type SveltekitRequestEvent = {
	fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
	parent: () => Promise<unknown>;
	isDataRequest: boolean;
	locals: {
		[localsSymbol]: TRPCSSRData;
	};
};

/**
 * @internal
 */
export type TRPCSSRData = Map<QueryKey, unknown>;

export function getSSRData(event: SveltekitRequestEventInput) {
	const locals = event.locals as SveltekitRequestEvent['locals'];
	if (!locals[localsSymbol]) {
		locals[localsSymbol] = new Map();
	}

	return locals[localsSymbol];
}

export function parseSSRArgs(args: any[]) {
	let event: SveltekitRequestEvent;
	let options: TRPCRequestOptions | undefined;
	let input: unknown;
	if (args.length === 1) {
		event = args[0];
	} else if (args.length === 2) {
		if (
			args[0] &&
			typeof args[0] === 'object' &&
			'locals' in args[0] &&
			localsSymbol in args[0].locals
		) {
			event = args[0];
			options = args[1];
		} else {
			input = args[0];
			event = args[1];
		}
	} else if (args.length === 3) {
		input = args[0];
		event = args[1];
		options = args[2];
	} else {
		throw new Error('Invalid arguments');
	}
	return [input, event, options] as const;
}

export * from './ssrLink';
