import {
	HTTPHeaders,
	PromiseAndCancel,
	TRPCClientError,
	TRPCClientRuntime,
	TRPCLink,
} from '@trpc/client';
import {
	AnyRouter,
	Maybe,
	ProcedureType,
	inferRouterError,
} from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
	TRPCResponse,
	TRPCResponseMessage,
	TRPCResultMessage,
} from '@trpc/server/rpc';
import { BROWSER } from 'esm-env';

export interface SSRLinkOptions {
	url: string;
	/**
	 * Add ponyfill for AbortController
	 */
	AbortController?: typeof AbortController | null;
	/**
	 * Headers to be set on outgoing requests or a callback that of said headers
	 * @link http://trpc.io/docs/v10/header
	 */
	headers?: HTTPHeaders | (() => HTTPHeaders | Promise<HTTPHeaders>);
}

// #region Remove these when we figure out how to import them from @trpc/client

export interface HTTPLinkOptions {
	url: string;
	/**
	 * Add ponyfill for fetch
	 */
	fetch?: typeof fetch;
	/**
	 * Add ponyfill for AbortController
	 */
	AbortController?: typeof AbortController | null;
	/**
	 * Headers to be set on outgoing requests or a callback that of said headers
	 * @link http://trpc.io/docs/v10/header
	 */
	headers?: HTTPHeaders | (() => HTTPHeaders | Promise<HTTPHeaders>);
}
export interface ResolvedHTTPLinkOptions {
	url: string;
	fetch: typeof fetch;
	AbortController: typeof AbortController | null;
	/**
	 * Headers to be set on outgoing request
	 * @link http://trpc.io/docs/v10/header
	 */
	headers: () => HTTPHeaders | Promise<HTTPHeaders>;
}

export type HTTPRequestOptions = ResolvedHTTPLinkOptions &
	GetInputOptions & {
		type: ProcedureType;
		path: string;
	};

export interface HTTPResult {
	json: TRPCResponse;
	meta: {
		response: Response;
	};
}
// FIXME:
// - the generics here are probably unnecessary
// - the RPC-spec could probably be simplified to combine HTTP + WS
/** @internal */
function transformResultInner<TRouter extends AnyRouter, TOutput>(
	response:
		| TRPCResponseMessage<TOutput, inferRouterError<TRouter>>
		| TRPCResponse<TOutput, inferRouterError<TRouter>>,
	runtime: TRPCClientRuntime,
) {
	if ('error' in response) {
		const error = runtime.transformer.deserialize(
			response.error,
		) as inferRouterError<TRouter>;
		return {
			ok: false,
			error: {
				...response,
				error,
			},
		} as const;
	}

	const result = {
		...response.result,
		...((!response.result.type || response.result.type === 'data') && {
			type: 'data',
			data: runtime.transformer.deserialize(response.result.data),
		}),
	} as TRPCResultMessage<TOutput>['result'];
	return { ok: true, result } as const;
}

function isObject(value: unknown): value is Record<string, unknown> {
	// check that value is object
	return !!value && !Array.isArray(value) && typeof value === 'object';
}

/**
 * Transforms and validates that the result is a valid TRPCResponse
 * @internal
 */
export function transformResult<TRouter extends AnyRouter, TOutput>(
	response:
		| TRPCResponseMessage<TOutput, inferRouterError<TRouter>>
		| TRPCResponse<TOutput, inferRouterError<TRouter>>,
	runtime: TRPCClientRuntime,
): ReturnType<typeof transformResultInner> {
	let result: ReturnType<typeof transformResultInner>;
	try {
		// Use the data transformers on the JSON-response
		result = transformResultInner(response, runtime);
	} catch (err) {
		throw new TRPCClientError('Unable to transform response from server');
	}

	// check that output of the transformers is a valid TRPCResponse
	if (
		!result.ok &&
		(!isObject(result.error.error) ||
			typeof result.error.error.code !== 'number')
	) {
		throw new TRPCClientError('Badly formatted response from server');
	}
	if (result.ok && !isObject(result.result)) {
		throw new TRPCClientError('Badly formatted response from server');
	}
	return result;
}

export function getUrl(opts: HTTPRequestOptions) {
	let url = opts.url + '/' + opts.path;
	const queryParts: string[] = [];
	if ('inputs' in opts) {
		queryParts.push('batch=1');
	}
	if (opts.type === 'query') {
		const input = getInput(opts);
		if (input !== undefined) {
			queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
		}
	}
	if (queryParts.length) {
		url += '?' + queryParts.join('&');
	}
	return url;
}
// https://github.com/trpc/trpc/pull/669
function arrayToDict(array: unknown[]) {
	const dict: Record<number, unknown> = {};
	for (let index = 0; index < array.length; index++) {
		const element = array[index];
		dict[index] = element;
	}
	return dict;
}
type GetInputOptions = {
	runtime: TRPCClientRuntime;
} & ({ inputs: unknown[] } | { input: unknown });

function getInput(opts: GetInputOptions) {
	return 'input' in opts
		? opts.runtime.transformer.serialize(opts.input)
		: arrayToDict(
				opts.inputs.map((_input) => opts.runtime.transformer.serialize(_input)),
		  );
}
type GetBodyOptions = { type: ProcedureType } & GetInputOptions;
function getBody(opts: GetBodyOptions) {
	if (opts.type === 'query') {
		return undefined;
	}
	const input = getInput(opts);
	return input !== undefined ? JSON.stringify(input) : undefined;
}
const METHOD = {
	query: 'GET',
	mutation: 'POST',
} as const;
function httpRequest(opts: HTTPRequestOptions): PromiseAndCancel<HTTPResult> {
	const { type } = opts;
	const ac = opts.AbortController ? new opts.AbortController() : null;

	const promise = new Promise<HTTPResult>((resolve, reject) => {
		const url = getUrl(opts);
		const body = getBody(opts);

		const meta = {} as HTTPResult['meta'];
		Promise.resolve(opts.headers())
			.then((headers) => {
				/* istanbul ignore if  */
				if (type === 'subscription') {
					throw new Error('Subscriptions should use wsLink');
				}
				return opts.fetch(url, {
					method: METHOD[type],
					signal: ac?.signal,
					body: body,
					headers: {
						'content-type': 'application/json',
						...headers,
					},
				});
			})
			.then((_res) => {
				meta.response = _res;
				return _res.json();
			})
			.then((json) => {
				resolve({
					json,
					meta,
				});
			})
			.catch(reject);
	});
	const cancel = () => {
		ac?.abort();
	};
	return { promise, cancel };
}
function getWindow() {
	if (typeof window !== 'undefined') {
		return window;
	}
	return globalThis;
}
function getAbortController(
	ac: Maybe<typeof AbortController>,
): typeof AbortController | null {
	return ac ?? getWindow().AbortController ?? null;
}

function resolveHTTPLinkOptions(
	opts: HTTPLinkOptions,
): ResolvedHTTPLinkOptions {
	const headers = opts.headers || (() => ({}));
	return {
		url: opts.url,
		AbortController: getAbortController(opts.AbortController),
		headers: typeof headers === 'function' ? headers : () => headers,
	} as any;
}
// #endregion

export function ssrLink<
	TRouter extends AnyRouter = AnyRouter,
	TChildOptions = unknown,
>(
	child: (childOptions: TChildOptions) => TRPCLink<TRouter>,
): (opts: TChildOptions & SSRLinkOptions) => TRPCLink<TRouter> {
	if (BROWSER) {
		return child;
	} else {
		return (options) => {
			const resolvedOpts = resolveHTTPLinkOptions(options);
			delete (resolvedOpts as any).fetch;

			return (runtime) =>
				({ op }) =>
					observable((observer) => {
						const { path, input, type, context } = op;
						if (!context.fetch) {
							observer.error(
								new TRPCClientError(
									'`context.fetch` is not defined. Ensure you are passing `event` to your SSR call.',
								),
							);
							return;
						}
						const { promise, cancel } = httpRequest({
							...resolvedOpts,
							fetch: context.fetch as typeof fetch,
							runtime,
							type,
							path,
							input,
						});
						promise
							.then((res) => {
								const transformed = transformResult(res.json, runtime);

								if (!transformed.ok) {
									observer.error(
										TRPCClientError.from(transformed.error, {
											meta: res.meta,
										}),
									);
									return;
								}
								observer.next({
									context: res.meta,
									result: transformed.result,
								});
								observer.complete();
							})
							.catch((cause) => observer.error(TRPCClientError.from(cause)));

						return () => {
							cancel();
						};
					});
		};
	}
}
