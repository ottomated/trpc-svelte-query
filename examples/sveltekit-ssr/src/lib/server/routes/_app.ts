import { z } from 'zod';
import { procedure, router } from '../trpc';
import { todosRouter } from './todos';

export const appRouter = router({
	todos: todosRouter,
	echo: procedure.input(z.string()).query(({ input }) => input),
});

export type AppRouter = typeof appRouter;
