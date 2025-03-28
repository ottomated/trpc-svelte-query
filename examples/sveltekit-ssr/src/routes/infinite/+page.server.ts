import { trpcServer } from '$lib/server/server';

export const load = async () => {
	await trpcServer.infinite.ssrInfinite({ cursor: 0 });
	await trpcServer.infinite.ssrInfinite({ cursor: 10 });
};
