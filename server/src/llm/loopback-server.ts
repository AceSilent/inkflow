/**
 * Loopback OAuth callback capture.
 *
 * Starts a transient local HTTP server that listens for the OAuth redirect at
 * `/auth/callback`, resolves the captured `{ code, state }`, and shows the
 * user a self-contained Chinese success page (dark, Ink Teal accent, no
 * emoji). Binds port 1455, falling back to 1457 if occupied. Closes itself —
 * and rejects — after a timeout (default 5 minutes).
 *
 * Usage:
 *   const capture = await startLoopbackCapture()
 *   const redirectUri = capture.redirectUri   // matches the bound port
 *   // ... open authorize URL in browser ...
 *   const { code, state } = await capture.result
 *   capture.close()
 */
import http from 'node:http'
import { AddressInfo } from 'node:net'
import {
  CODEX_REDIRECT_PATH,
  CODEX_REDIRECT_PORT,
  CODEX_REDIRECT_PORT_FALLBACK,
  buildRedirectUri,
} from './codex-auth.js'

export interface LoopbackCapture {
  /** The port the server actually bound (1455 or the fallback). */
  port: number
  /** The redirect URI matching the bound port (host = localhost). */
  redirectUri: string
  /** Resolves with the captured authorization code + state, or rejects. */
  result: Promise<{ code: string; state: string }>
  /** Stop the server and release the port. Safe to call multiple times. */
  close: () => void
}

export interface StartLoopbackCaptureOptions {
  port?: number
  fallbackPort?: number
  /** Timeout before the capture auto-closes and rejects (ms). */
  timeoutMs?: number
}

/** Dark, Ink Teal, no-emoji success page in simplified Chinese. */
const SUCCESS_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>登录成功 · InkFlow</title>
<style>
  :root {
    --bg: #14171a;
    --panel: #1c2024;
    --border: #2a2f34;
    --text: #e6e9ec;
    --muted: #8b949e;
    --accent: #2dd4bf;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  }
  .wrap {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .card {
    width: 100%;
    max-width: 420px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px 36px;
    text-align: center;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  }
  .badge {
    width: 56px;
    height: 56px;
    margin: 0 auto 24px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .badge svg { width: 28px; height: 28px; }
  h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 12px;
    letter-spacing: 0.02em;
  }
  p {
    font-size: 14px;
    line-height: 1.7;
    color: var(--muted);
    margin: 0;
  }
  .brand {
    margin-top: 28px;
    font-size: 12px;
    letter-spacing: 0.16em;
    color: var(--accent);
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" stroke-width="2.4"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1>登录成功</h1>
      <p>已成功连接 ChatGPT 账号。<br />可以关闭此页面，返回 InkFlow 继续创作。</p>
      <div class="brand">InkFlow</div>
    </div>
  </div>
</body>
</html>`

/** Minimal error page (still dark, Chinese). */
function errorHtml(message: string): string {
  return SUCCESS_HTML.replace('登录成功', '登录失败')
    .replace('已成功连接 ChatGPT 账号。<br />可以关闭此页面，返回 InkFlow 继续创作。', `${message}<br />请返回 InkFlow 重试。`)
    .replace('stroke="#2dd4bf"', 'stroke="#f87171"')
    .replace('border: 2px solid var(--accent)', 'border: 2px solid #f87171')
}

/** Try to listen on `port`; resolve the server or reject (e.g. EADDRINUSE). */
function tryListen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    // host 'localhost' to match the registered redirect URI host.
    server.listen(port, 'localhost')
  })
}

/**
 * Start the loopback capture server. Resolves once the server is bound and
 * listening; `result` resolves later when the callback arrives.
 */
export async function startLoopbackCapture(
  options: StartLoopbackCaptureOptions = {}
): Promise<LoopbackCapture> {
  const primary = options.port ?? CODEX_REDIRECT_PORT
  const fallback = options.fallbackPort ?? CODEX_REDIRECT_PORT_FALLBACK
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000

  let resolveResult!: (value: { code: string; state: string }) => void
  let rejectResult!: (reason: Error) => void
  const result = new Promise<{ code: string; state: string }>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  // The callback may settle (reject on error/timeout) before the caller has
  // attached a handler to `result`. Keep a passive handler on a derived
  // promise so Node never reports a transient "unhandled rejection"; the
  // caller still awaits the original `result` and observes the real outcome.
  result.catch(() => {})

  let settled = false
  let timer: NodeJS.Timeout | undefined

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost`)
    if (url.pathname !== CODEX_REDIRECT_PATH) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Not Found')
      return
    }

    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    if (error || !code || !state) {
      const msg = error ? `授权被拒绝（${error}）。` : '回调缺少授权码。'
      res.statusCode = 400
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(errorHtml(msg))
      if (!settled) {
        settled = true
        rejectResult(new Error(`OAuth callback failed: ${error ?? 'missing code/state'}`))
      }
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(SUCCESS_HTML)

    if (!settled) {
      settled = true
      resolveResult({ code, state })
    }
  })

  // Try primary port, fall back on EADDRINUSE.
  let boundPort = primary
  try {
    await tryListen(server, primary)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && fallback !== primary) {
      await tryListen(server, fallback)
      boundPort = fallback
    } else {
      throw err
    }
  }

  // Prefer the OS-reported port (covers the port=0 ephemeral case in tests).
  const addr = server.address() as AddressInfo | null
  if (addr && typeof addr === 'object' && typeof addr.port === 'number') {
    boundPort = addr.port
  }

  const close = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    server.close()
  }

  timer = setTimeout(() => {
    if (!settled) {
      settled = true
      rejectResult(new Error(`OAuth callback timed out after ${timeoutMs}ms`))
    }
    close()
  }, timeoutMs)
  // Don't keep the event loop alive solely for this timer.
  if (typeof timer.unref === 'function') timer.unref()

  return {
    port: boundPort,
    redirectUri: buildRedirectUri(boundPort),
    result,
    close,
  }
}
