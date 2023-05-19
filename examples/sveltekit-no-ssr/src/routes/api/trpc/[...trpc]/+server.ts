import { createContext } from "$lib/server/context";
import { appRouter } from "$lib/server/routes/_app";
import { createTRPCSvelteServer } from "trpc-svelte-query/server";

const trpcServer = createTRPCSvelteServer({
	endpoint: '/api/trpc',
	router: appRouter,
	createContext,
});

export const GET = trpcServer.handler;
export const POST = trpcServer.handler;
