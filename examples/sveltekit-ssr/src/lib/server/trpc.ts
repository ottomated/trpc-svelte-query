import { transformer } from '$lib/trpc/transformer';
import { initTRPC } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
	transformer,
});

export const router = t.router;

export const procedure = t.procedure;
