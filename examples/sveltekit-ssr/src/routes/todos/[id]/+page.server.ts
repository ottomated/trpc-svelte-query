import { trpcServer } from '$lib/server/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await trpcServer.todos.get.ssr({ id: event.params.id }, event);
};
