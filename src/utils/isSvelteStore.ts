import { StoreOrVal } from '@tanstack/svelte-query';
import { Readable } from 'svelte/store';

export function isSvelteStore<TStore extends object>(
	obj: StoreOrVal<TStore>,
): obj is Readable<TStore> {
	return 'subscribe' in obj && typeof obj.subscribe === 'function';
}
