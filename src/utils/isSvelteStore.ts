import type { StoreOrVal } from '@tanstack/svelte-query';
import type { Readable } from 'svelte/store';

export function isSvelteStore<TStore extends object>(
	obj: StoreOrVal<TStore>,
): obj is Readable<TStore> {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'subscribe' in obj &&
		typeof obj.subscribe === 'function'
	);
}
