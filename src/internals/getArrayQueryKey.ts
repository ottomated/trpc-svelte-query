export type QueryType = 'query' | 'infinite' | 'any';

export type QueryKey = [
	string[],
	{ input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query. This function doesn't need to convert legacy
 * formats.
 **/
export function getArrayQueryKey(
	path: string[],
	input: unknown,
	type: QueryType,
): QueryKey {
	// Construct a query key that is easy to destructure and flexible for
	// partial selecting etc.
	// https://github.com/trpc/trpc/issues/3128
	const hasInput = typeof input !== 'undefined';
	const hasType = type && type !== 'any';
	if (!hasInput && !hasType)
		// for `utils.invalidate()` to match all queries (including vanilla react-query)
		// we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`
		return path.length ? [path] : ([] as unknown as QueryKey);

	const inputAndType = {} as Exclude<QueryKey[1], undefined>;
	if (hasInput) inputAndType.input = input;
	if (hasType) inputAndType.type = type;

	return [path, inputAndType];
}
