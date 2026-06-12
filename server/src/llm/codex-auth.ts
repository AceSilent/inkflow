/**
 * Codex / ChatGPT OAuth — pure logic, zero Fastify dependency.
 *
 * Implements the PKCE authorization-code flow used by the Codex CLI against
 * ChatGPT subscription login. All protocol constants below are the verified,
 * public values for the Codex CLI's PKCE client (no client secret). Every
 * network function accepts an injectable `fetchImpl` so it can be unit tested
 * without real HTTP.
 *
 * Flow overview:
 *   1. generatePkce() → { verifier, challenge }
 *   2. buildAuthorizeUrl(...) → open in browser
 *   3. user authorizes → redirect back with { code, state }
 *   4. exchangeCode(...) → TokenSet (access/refresh/id tokens + account id)
 *   5. refreshTokens(...) when the access token is near expiry / rotates the
 *      one-time refresh token.
 */
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Verified protocol constants (public PKCE client — no secret).
// ---------------------------------------------------------------------------

/** Public PKCE client id for the Codex CLI flow. */
export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

/** OAuth endpoints on auth.openai.com. */
export const CODEX_AUTHORIZE_ENDPOINT = 'https://auth.openai.com/oauth/authorize'
export const CODEX_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token'
export const CODEX_REVOKE_ENDPOINT = 'https://auth.openai.com/oauth/revoke'

/**
 * Redirect URI must match the registered value byte-for-byte. Host is
 * `localhost` (not 127.0.0.1) and the path is fixed at /auth/callback. The
 * port falls back to 1457 when 1455 is occupied; the loopback server reports
 * which port it bound so callers can build the matching redirect URI.
 */
export const CODEX_REDIRECT_PORT = 1455
export const CODEX_REDIRECT_PORT_FALLBACK = 1457
export const CODEX_REDIRECT_PATH = '/auth/callback'

/** Default OAuth scope requested by the Codex CLI. */
export const CODEX_SCOPE = 'openid profile email offline_access'

/** The claim namespace that carries chatgpt_account_id / chatgpt_plan_type. */
export const OPENAI_AUTH_CLAIM = 'https://api.openai.com/auth'

/** Build the default redirect URI for a given bound port. */
export function buildRedirectUri(port: number = CODEX_REDIRECT_PORT): string {
  return `http://localhost:${port}${CODEX_REDIRECT_PATH}`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FetchImpl = typeof fetch

export interface PkcePair {
  /** 43-128 char base64url random string (sent on token exchange). */
  verifier: string
  /** base64url(sha256(verifier)) without padding (sent on authorize). */
  challenge: string
}

export interface TokenSet {
  access_token: string
  refresh_token: string
  id_token: string
  /** chatgpt_account_id extracted from the id_token (or access_token) JWT. */
  account_id?: string
  /** Absolute expiry time of the access token, in epoch milliseconds. */
  expires_at: number
  /** chatgpt_plan_type, when present in the JWT auth claim. */
  plan_type?: string
}

/** Raw token-endpoint response shape (subset we consume). */
interface RawTokenResponse {
  id_token?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

/**
 * Error thrown for non-2xx OAuth responses. Carries a normalized `code` so
 * callers can branch on refresh_token_reused / expired cases.
 */
export class CodexAuthError extends Error {
  readonly code: string
  readonly status?: number
  readonly raw?: string
  constructor(message: string, opts: { code: string; status?: number; raw?: string }) {
    super(message)
    this.name = 'CodexAuthError'
    this.code = opts.code
    this.status = opts.status
    this.raw = opts.raw
  }
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generate a PKCE verifier/challenge pair.
 * - verifier: 43 chars of base64url (32 random bytes → 43 chars, no padding),
 *   well within the 43-128 spec range.
 * - challenge: base64url(sha256(verifier)) without padding, method S256.
 */
export function generatePkce(): PkcePair {
  const verifier = base64UrlEncode(crypto.randomBytes(32))
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** Generate a random base64url CSRF state token. */
export function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(32))
}

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export interface BuildAuthorizeUrlInput {
  challenge: string
  state: string
  redirectUri: string
}

/**
 * Build the full authorization URL. Includes every query parameter the Codex
 * CLI flow requires, in addition to the standard PKCE/OAuth params.
 */
export function buildAuthorizeUrl({ challenge, state, redirectUri }: BuildAuthorizeUrlInput): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CODEX_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'codex_cli_rs',
    state,
  })
  return `${CODEX_AUTHORIZE_ENDPOINT}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// JWT decoding
// ---------------------------------------------------------------------------

/**
 * Decode the payload of a JWT (the middle segment). Does NOT verify the
 * signature — these tokens are issued to us over TLS by the token endpoint,
 * we only read claims for local bookkeeping. Throws a clear error on
 * malformed input.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  if (typeof jwt !== 'string' || jwt.length === 0) {
    throw new CodexAuthError('Cannot decode JWT: empty or non-string token', { code: 'jwt_malformed' })
  }
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw new CodexAuthError(
      `Cannot decode JWT: expected 3 dot-separated segments, got ${parts.length}`,
      { code: 'jwt_malformed' }
    )
  }
  const payloadSegment = parts[1]
  let json: string
  try {
    json = Buffer.from(payloadSegment, 'base64url').toString('utf-8')
  } catch (err) {
    throw new CodexAuthError(`Cannot decode JWT payload: base64url decode failed (${(err as Error).message})`, {
      code: 'jwt_malformed',
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new CodexAuthError(`Cannot decode JWT payload: not valid JSON (${(err as Error).message})`, {
      code: 'jwt_malformed',
    })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodexAuthError('Cannot decode JWT payload: not a JSON object', { code: 'jwt_malformed' })
  }
  return parsed as Record<string, unknown>
}

/** Pull the OpenAI auth claim object from a decoded JWT payload. */
function readAuthClaim(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const claim = payload[OPENAI_AUTH_CLAIM]
  if (claim && typeof claim === 'object') return claim as Record<string, unknown>
  return undefined
}

/**
 * Extract chatgpt_account_id from an id_token (or access_token) JWT.
 * Returns undefined if the token can't be decoded or the claim is absent.
 */
export function extractAccountId(idToken: string): string | undefined {
  let payload: Record<string, unknown>
  try {
    payload = decodeJwtPayload(idToken)
  } catch {
    return undefined
  }
  const auth = readAuthClaim(payload)
  const accountId = auth?.['chatgpt_account_id']
  return typeof accountId === 'string' ? accountId : undefined
}

/** Extract chatgpt_plan_type from a JWT, if present. */
export function extractPlanType(idToken: string): string | undefined {
  let payload: Record<string, unknown>
  try {
    payload = decodeJwtPayload(idToken)
  } catch {
    return undefined
  }
  const auth = readAuthClaim(payload)
  const plan = auth?.['chatgpt_plan_type']
  return typeof plan === 'string' ? plan : undefined
}

/** Read the `exp` claim (seconds) from a JWT, in epoch milliseconds. */
function readJwtExpMs(jwt: string): number | undefined {
  let payload: Record<string, unknown>
  try {
    payload = decodeJwtPayload(jwt)
  } catch {
    return undefined
  }
  const exp = payload['exp']
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : undefined
}

// ---------------------------------------------------------------------------
// Token endpoint calls
// ---------------------------------------------------------------------------

/** Normalize OpenAI OAuth error codes into recognizable buckets. */
function classifyTokenError(status: number, rawBody: string): { code: string; message: string } {
  let errCode: string | undefined
  let errDesc: string | undefined
  try {
    const parsed = JSON.parse(rawBody) as { error?: string; error_description?: string }
    errCode = parsed.error
    errDesc = parsed.error_description
  } catch {
    /* non-JSON body — fall through */
  }
  const haystack = `${errCode ?? ''} ${errDesc ?? ''} ${rawBody}`.toLowerCase()
  if (haystack.includes('refresh_token_reused') || haystack.includes('reused')) {
    return { code: 'refresh_token_reused', message: 'Refresh token was already used (one-time rotation): re-login required.' }
  }
  if (haystack.includes('expired')) {
    return { code: 'expired', message: 'Token expired or invalid: re-login required.' }
  }
  if (errCode === 'invalid_grant') {
    return { code: 'invalid_grant', message: 'Invalid grant: the code or refresh token is invalid.' }
  }
  return {
    code: errCode ?? `http_${status}`,
    message: errDesc ?? `Token endpoint returned HTTP ${status}.`,
  }
}

/** Build a TokenSet from a raw token-endpoint response. */
function toTokenSet(raw: RawTokenResponse, fallbackRefresh?: string): TokenSet {
  const access_token = raw.access_token
  if (!access_token) {
    throw new CodexAuthError('Token endpoint response missing access_token', { code: 'invalid_response' })
  }
  const refresh_token = raw.refresh_token ?? fallbackRefresh
  if (!refresh_token) {
    throw new CodexAuthError('Token endpoint response missing refresh_token', { code: 'invalid_response' })
  }
  const id_token = raw.id_token ?? ''
  // Prefer the id_token for claims; fall back to the access_token JWT.
  const claimSource = id_token || access_token
  const account_id = extractAccountId(claimSource)
  const plan_type = extractPlanType(claimSource)

  // expires_at: prefer the access_token's own exp claim, else expires_in.
  const expFromJwt = readJwtExpMs(access_token)
  const expFromExpiresIn =
    typeof raw.expires_in === 'number' && Number.isFinite(raw.expires_in)
      ? Date.now() + raw.expires_in * 1000
      : undefined
  const expires_at = expFromJwt ?? expFromExpiresIn ?? Date.now()

  return { access_token, refresh_token, id_token, account_id, plan_type, expires_at }
}

async function postForm(
  fetchImpl: FetchImpl,
  body: Record<string, string>
): Promise<RawTokenResponse> {
  const res = await fetchImpl(CODEX_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    const { code, message } = classifyTokenError(res.status, text)
    throw new CodexAuthError(message, { code, status: res.status, raw: text })
  }
  let parsed: RawTokenResponse
  try {
    parsed = JSON.parse(text) as RawTokenResponse
  } catch {
    throw new CodexAuthError('Token endpoint returned non-JSON success body', {
      code: 'invalid_response',
      status: res.status,
      raw: text,
    })
  }
  return parsed
}

export interface ExchangeCodeInput {
  code: string
  verifier: string
  redirectUri: string
  fetchImpl?: FetchImpl
}

/** Exchange an authorization code for a TokenSet. */
export async function exchangeCode({
  code,
  verifier,
  redirectUri,
  fetchImpl = fetch,
}: ExchangeCodeInput): Promise<TokenSet> {
  const raw = await postForm(fetchImpl, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: CODEX_CLIENT_ID,
    code_verifier: verifier,
  })
  return toTokenSet(raw)
}

export interface RefreshTokensInput {
  refresh_token: string
  fetchImpl?: FetchImpl
}

/**
 * Refresh tokens. The refresh token is one-time and rotates: the returned
 * TokenSet carries the NEW refresh token (or falls back to the old one only
 * if the endpoint omits it).
 */
export async function refreshTokens({ refresh_token, fetchImpl = fetch }: RefreshTokensInput): Promise<TokenSet> {
  const raw = await postForm(fetchImpl, {
    grant_type: 'refresh_token',
    refresh_token,
    client_id: CODEX_CLIENT_ID,
  })
  return toTokenSet(raw, refresh_token)
}

// ---------------------------------------------------------------------------
// Expiry checks
// ---------------------------------------------------------------------------

/**
 * Whether the access token is at/near expiry. Decodes the access_token's exp
 * claim; if that can't be read, falls back to the stored `expires_at`.
 * Returns true when expiry is within `skewMs` of now.
 */
export function accessTokenExpiresSoon(tokenSet: TokenSet, skewMs: number = 5 * 60 * 1000): boolean {
  const expFromJwt = readJwtExpMs(tokenSet.access_token)
  const exp = expFromJwt ?? tokenSet.expires_at
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return true
  return exp - Date.now() <= skewMs
}
