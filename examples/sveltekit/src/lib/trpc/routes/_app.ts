import { router } from '../server';
import { nameRouter } from './names';

export const appRouter = router({
  names: nameRouter,
});

export type AppRouter = typeof appRouter;
