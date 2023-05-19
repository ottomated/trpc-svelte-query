import type { RequestEvent } from "@sveltejs/kit";
import type { inferAsyncReturnType } from "@trpc/server";

export const createContext = async (event: RequestEvent) => {
	return {
		event
	}
};

export type Context = inferAsyncReturnType<typeof createContext>;
