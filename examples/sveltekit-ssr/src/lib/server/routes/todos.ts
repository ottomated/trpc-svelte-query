import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { procedure, router } from '../trpc';

const db = new Map<string, string>();

export const todosRouter = router({
  list: procedure.query(async () => {
    await new Promise((r) => setTimeout(r, 100));
    return [...db.entries()].map(([id, data]) => ({ id, data }));
  }),
  get: procedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
      await new Promise((r) => setTimeout(r, 100));

      if (!db.has(input.id)) {
        throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Todo not found'
        });
      }
      return db.get(input.id)!;
    }),
  add: procedure
    .input(
      z.object({
        data: z.string(),
      }),
    )
    .mutation(({ input }) => {
      db.set(crypto.randomUUID(), input.data);
    }),
  delete: procedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(({ input }) => {
      db.delete(input.id);
    }),
  update: procedure
    .input(
      z.object({
        id: z.string(),
        data: z.string(),
      }),
    )
    .mutation(({ input }) => {
      if (!db.has(input.id)) {
        throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Todo not found'
        });
      }
      db.set(input.id, input.data);
      return input;
    }),
});
