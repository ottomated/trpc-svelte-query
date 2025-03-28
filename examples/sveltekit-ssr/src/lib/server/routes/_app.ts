import { z } from 'zod';
import { procedure, router } from '../trpc';
import { todosRouter } from './todos';

export const appRouter = router({
	todos: todosRouter,
	echo: procedure.input(z.string()).query(({ input }) => input),
	infinite: procedure
		.input(
			z.object({
				cursor: z.number().nullish(),
			}),
		)
		.query(({ input }) => {
			return {
				items: new Array(10).fill(0).map((_, i) => (input.cursor ?? 0) + i),
				nextCursor: (input.cursor ?? 0) + 10,
			};
		}),
});

export type AppRouter = typeof appRouter;
