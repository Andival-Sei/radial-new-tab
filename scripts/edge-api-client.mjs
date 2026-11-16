const origin = 'https://api.addons.microsoftedge.microsoft.com';
export const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EdgeApiError extends Error {
  constructor(message, code, httpStatus = null) {
    super(message);
    this.name = 'EdgeApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Never log credentials, request headers or raw error bodies. POSTs are never retried. */
export function createEdgeApi({
  apiKey,
  clientId,
  productId,
  fetcher = fetch,
  record = async () => {},
}) {
  if (
    typeof apiKey !== 'string' ||
    !apiKey.trim() ||
    !guid.test(clientId ?? '') ||
    !guid.test(productId ?? '')
  ) {
    throw new EdgeApiError(
      'Configure EDGE_API_KEY, EDGE_CLIENT_ID, and EDGE_PRODUCT_ID.',
      'CONFIGURATION',
    );
  }
  const base = `${origin}/v1/products/${productId}`;
  const headers = { Authorization: `ApiKey ${apiKey.trim()}`, 'X-ClientID': clientId };
  return async (path, { stage, operationId, ...options }) => {
    let response;
    try {
      response = await fetcher(`${base}${path}`, {
        ...options,
        headers: { ...options.headers, ...headers },
        redirect: 'error',
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      const code = error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK';
      await record({ stage, operationId, status: 'Failed', errorCode: code, httpStatus: null });
      throw new EdgeApiError(
        'Edge API request did not complete. Inspect the recorded operation before retrying; POSTs are not retried.',
        code,
      );
    }
    if (!response.ok) {
      const httpStatus = response.status;
      const code =
        httpStatus === 401 ? 'AUTHENTICATION' : httpStatus === 403 ? 'AUTHORIZATION' : 'HTTP';
      await record({ stage, operationId, status: 'Failed', errorCode: code, httpStatus });
      const detail =
        httpStatus === 401
          ? 'Check Publish API key expiry and update EDGE_API_KEY in GitHub Secrets.'
          : httpStatus === 403
            ? 'Check the client and product access in Partner Center.'
            : httpStatus === 404
              ? 'Check product/operation IDs; an old operation may no longer be available.'
              : 'Inspect Partner Center and the recorded operation before retrying.';
      throw new EdgeApiError(
        `Edge API returned HTTP ${httpStatus}. ${detail} No automatic POST retry was performed.`,
        code,
        httpStatus,
      );
    }
    return response;
  };
}

/** A read-only access check also works while another submission is in review. */
export async function getEdgeOperation({ operationId, stage = 'submission', ...config }) {
  if (!guid.test(operationId ?? '') || !['upload', 'submission'].includes(stage)) {
    throw new EdgeApiError(
      'Provide a valid operation ID and upload/submission stage.',
      'CONFIGURATION',
    );
  }
  const request = createEdgeApi(config);
  const path =
    stage === 'upload'
      ? `/submissions/draft/package/operations/${operationId}`
      : `/submissions/operations/${operationId}`;
  const response = await request(path, { stage: 'access-check', operationId });
  const result = await response.json();
  if (
    typeof result.id !== 'string' ||
    result.id.toLowerCase() !== operationId.toLowerCase() ||
    !['InProgress', 'Succeeded', 'Failed'].includes(result.status)
  ) {
    throw new EdgeApiError(
      'Edge API returned an unexpected operation response.',
      'INVALID_RESPONSE',
    );
  }
  return {
    authenticated: true,
    httpStatus: response.status,
    stage,
    operationId,
    status: result.status,
    errorCode: result.errorCode || null,
  };
}
