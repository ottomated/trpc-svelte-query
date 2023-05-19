import { RequestEvent } from '@sveltejs/kit';

/**
 * Args: [input, router] if input,
 * Args: [router] if no input
 */
export function parseSSRArgs(
	args: any[],
): [rawInput: unknown, event: RequestEvent] {
	if (args.length === 1) {
		return [undefined, args[0]];
	} else if (args.length === 2) {
		return args as [unknown, RequestEvent];
	} else {
		throw new Error('Invalid arguments');
	}
}
