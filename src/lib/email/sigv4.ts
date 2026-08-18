import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4.
 *
 * Written out rather than pulled from `@aws-sdk/*`: the SES client alone drags
 * in a large dependency tree for what is, at bottom, four HMACs and a hash. On
 * a serverless route that sends a few hundred emails a day, the bundle cost is
 * real and the maintenance cost of sixty lines is not.
 *
 * Kept in its own module with no secrets of its own — the credentials are
 * arguments — so it can be unit-tested against AWS's published test vectors.
 *
 * The two things that silently break SigV4, both handled below:
 *   - header names must be LOWERCASE and sorted, in both the canonical headers
 *     and the SignedHeaders list, and the two must agree exactly
 *   - the payload hash is of the EXACT bytes sent; hashing a re-serialised body
 *     produces a valid-looking signature that AWS rejects
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

export interface SigV4Input {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injectable so tests can pin a timestamp. */
  now?: Date;
}

export interface SignedHeaders {
  authorization: string;
  'x-amz-date': string;
  host: string;
  'content-type': string;
}

export function signRequest(input: SigV4Input): SignedHeaders {
  const now = input.now ?? new Date();

  // 20260813T101530Z / 20260813
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(input.body);
  const contentType = 'application/json';

  // Lowercase, sorted, and identical to signedHeaders below.
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${input.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    input.method,
    input.path,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  // The four-step key derivation. Each HMAC uses the previous result as the key.
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    authorization: `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-date': amzDate,
    host: input.host,
    'content-type': contentType,
  };
}

/** Exposed for the request builder, which must send the same value it signed. */
export function payloadHash(body: string): string {
  return sha256Hex(body);
}
