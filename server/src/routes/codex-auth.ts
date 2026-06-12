/**
 * Codex / ChatGPT OAuth login route.
 *
 * Drives the PKCE authorization-code flow end to end from the settings panel:
 *
 *   POST /api/v1/auth/codex/start   → starts a loopback listener, returns the
 *                                     authorize_url for the frontend to open and
 *                                     the bound port. The callback is awaited in
 *                                     the background; status moves pending → success/error.
 *   GET  /api/v1/auth/codex/status  → poll the background flow's progress.
 *   POST /api/v1/auth/codex/logout  → clear stored credentials.
 *   GET  /api/v1/auth/codex/info    → current login state (reads disk, no network).
 *
 * The frontend never sees the verifier/state — they live only in module memory
 * for the duration of one login attempt and are matched against the loopback
 * callback's state to defeat CSRF.
 */
import type { FastifyPluginAsync } from 'fastify'
import {
  accessTokenExpiresSoon,
  buildAuthorizeUrl,
  decodeJwtPayload,
  exchangeCode,
  extractAccountId,
  extractPlanType,
  generatePkce,
  generateState,
  CodexAuthError,
} from '../llm/codex-auth.js'
import {
  startLoopbackCapture,
  type LoopbackCapture,
} from '../llm/loopback-server.js'
import {
  clearCodexAuth,
  resolveAuthSource,
  saveCodexAuth,
} from '../llm/codex-store.js'

interface Options {
  dataDir: string
  /** Test hooks — inject loopback + exchange so routes can run offline. */
  startLoopback?: typeof startLoopbackCapture
  exchange?: typeof exchangeCode
}

type LoginState = 'idle' | 'pending' | 'success' | 'error'

interface LoginFlow {
  state: LoginState
  expectedState: string
  verifier: string
  capture: LoopbackCapture
  accountId?: string
  planType?: string
  message?: string
  /** Epoch ms when this attempt should be considered abandoned. */
  expiresAt: number
}

/** How long a pending login attempt stays valid before it is reaped. */
const LOGIN_TTL_MS = 5 * 60 * 1000

/** Read the access-token JWT `exp` claim as epoch ms, or undefined when absent. */
function readAccessTokenExpiryMs(accessToken: string): number | undefined {
  try {
    const payload = decodeJwtPayload(accessToken)
    const exp = payload['exp']
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : undefined
  } catch {
    return undefined
  }
}

export const codexAuthRoutes: FastifyPluginAsync<Options> = async (app, opts) => {
  const { dataDir } = opts
  const startLoopback = opts.startLoopback ?? startLoopbackCapture
  const exchange = opts.exchange ?? exchangeCode

  // A single in-flight login attempt at a time, keyed by nothing — the login is
  // a per-installation operation. Stored module-locally (per plugin instance).
  let flow: LoginFlow | null = null

  const reapIfExpired = (): void => {
    if (flow && flow.state === 'pending' && Date.now() > flow.expiresAt) {
      flow.capture.close()
      flow = { ...flow, state: 'error', message: '登录超时，请重试。' }
    }
  }

  // POST /api/v1/auth/codex/start
  app.post('/auth/codex/start', async (_req, reply) => {
    // Abandon any prior pending attempt (its loopback port would conflict).
    if (flow && flow.state === 'pending') {
      flow.capture.close()
    }

    const { verifier, challenge } = generatePkce()
    const expectedState = generateState()

    let capture: LoopbackCapture
    try {
      capture = await startLoopback()
    } catch (err) {
      reply.code(500)
      const message = err instanceof Error ? err.message : '无法启动本地回调服务'
      return { error: `无法启动本地回调服务：${message}` }
    }

    const authorizeUrl = buildAuthorizeUrl({
      challenge,
      state: expectedState,
      redirectUri: capture.redirectUri,
    })

    const current: LoginFlow = {
      state: 'pending',
      expectedState,
      verifier,
      capture,
      expiresAt: Date.now() + LOGIN_TTL_MS,
    }
    flow = current

    // Drive the callback → exchange → persist in the background.
    void (async () => {
      try {
        const { code, state } = await capture.result
        if (state !== current.expectedState) {
          throw new CodexAuthError('OAuth state mismatch (possible CSRF).', { code: 'state_mismatch' })
        }
        const tokenSet = await exchange({
          code,
          verifier: current.verifier,
          redirectUri: capture.redirectUri,
        })
        await saveCodexAuth(dataDir, tokenSet)
        if (flow === current) {
          flow = {
            ...current,
            state: 'success',
            accountId: tokenSet.account_id,
            planType: tokenSet.plan_type,
            message: '登录成功',
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '登录失败'
        if (flow === current) {
          flow = { ...current, state: 'error', message }
        }
      } finally {
        capture.close()
      }
    })()

    return { authorize_url: authorizeUrl, port: capture.port }
  })

  // GET /api/v1/auth/codex/status
  app.get('/auth/codex/status', async () => {
    reapIfExpired()
    if (!flow) return { state: 'idle' as LoginState }
    return {
      state: flow.state,
      ...(flow.accountId ? { account_id: flow.accountId } : {}),
      ...(flow.planType ? { plan_type: flow.planType } : {}),
      ...(flow.message ? { message: flow.message } : {}),
    }
  })

  // POST /api/v1/auth/codex/logout
  app.post('/auth/codex/logout', async () => {
    if (flow && flow.state === 'pending') {
      flow.capture.close()
    }
    flow = null

    // Determine the active source BEFORE clearing so we can tell the user
    // whether anything was actually removed. clearCodexAuth only ever deletes
    // the InkFlow-private store — it never touches ~/.codex/auth.json.
    let source: 'inkflow' | 'codex-cli' | null = null
    try {
      const resolved = await resolveAuthSource(dataDir)
      source = resolved?.kind ?? null
    } catch {
      // Corrupt InkFlow store — clearing below will remove it anyway.
      source = 'inkflow'
    }

    await clearCodexAuth(dataDir)

    if (source === 'codex-cli') {
      // The login came from the shared Codex CLI file. We deliberately leave it
      // intact (deleting it would break `codex` CLI); report that to the user.
      return {
        status: 'ok',
        source: 'codex-cli' as const,
        message: '凭据来自 ~/.codex，未删除（如需退出请运行 codex logout）。',
      }
    }
    return { status: 'ok', source }
  })

  // GET /api/v1/auth/codex/info
  app.get('/auth/codex/info', async () => {
    let source
    try {
      // Offline resolution: InkFlow store first, then the shared ~/.codex/auth.json.
      source = await resolveAuthSource(dataDir)
    } catch (err) {
      // store_corrupt etc. — report as not authenticated rather than 500.
      return {
        authenticated: false,
        token_valid: false,
        source: null,
        ...(err instanceof CodexAuthError ? { message: err.message } : {}),
      }
    }
    if (!source) {
      return { authenticated: false, token_valid: false, source: null }
    }
    const { raw: stored, kind } = source
    const accountId = stored.tokens.account_id
      ?? extractAccountId(stored.tokens.id_token || stored.tokens.access_token)
    const planType = extractPlanType(stored.tokens.id_token || stored.tokens.access_token)
    // token_valid is a best-effort, offline check: a token that is not near
    // expiry is treated as usable (a true validity check needs a live call).
    const tokenValid = !accessTokenExpiresSoon({
      access_token: stored.tokens.access_token,
      refresh_token: stored.tokens.refresh_token,
      id_token: stored.tokens.id_token,
      account_id: accountId,
      expires_at: 0,
    })
    const expiresAt = readAccessTokenExpiryMs(stored.tokens.access_token)
    return {
      authenticated: true,
      token_valid: tokenValid,
      source: kind,
      ...(accountId ? { account_id: accountId } : {}),
      ...(planType ? { plan_type: planType } : {}),
      ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
      last_refresh: stored.last_refresh,
    }
  })
}
