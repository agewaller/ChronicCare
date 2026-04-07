/**
 * Cloudflare Worker - Anthropic API Proxy (Vision対応)
 *
 * ブラウザから直接Anthropic APIを呼べないCORS問題を解決するプロキシ。
 * ブラウザ → このWorker → Anthropic API の経路でリクエストを中継。
 * Vision API（画像分析）にも対応。
 *
 * デプロイ手順:
 * 1. https://dash.cloudflare.com/ にログイン（無料アカウントでOK）
 * 2. Workers & Pages → Create Worker
 * 3. このコードを貼り付けて Deploy
 * 4. Settings → Variables で以下を追加（オプション）:
 *    - ALLOWED_ORIGINS: 許可するオリジン（例: https://cares.advisers.jp）
 * 5. 生成されたURL（例: https://anthropic-proxy.your-account.workers.dev）を
 *    未病ダイアリーの設定 → APIプロキシURLに入力
 *
 * 注意: Cloudflare Workers無料プランではリクエストボディは100MBまで。
 *       画像分析の場合でも通常は数MB以内なので問題ありません。
 */

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGINS || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405, allowedOrigin);
    }

    try {
      const apiKey = request.headers.get('x-api-key');
      if (!apiKey) {
        return corsResponse({ error: 'x-api-key header is required' }, 401, allowedOrigin);
      }

      // Read request body as-is (supports large payloads with base64 images)
      const body = await request.text();

      // Validate JSON
      try {
        JSON.parse(body);
      } catch (e) {
        return corsResponse({ error: 'Invalid JSON in request body' }, 400, allowedOrigin);
      }

      // Forward to Anthropic API
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: body,
      });

      const responseData = await anthropicResponse.text();

      return new Response(responseData, {
        status: anthropicResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigin,
        },
      });
    } catch (error) {
      console.error('[Proxy Error]', error.message);
      return corsResponse({
        error: 'Proxy error: ' + error.message,
        hint: 'Anthropic APIへの接続に失敗しました。APIキーを確認してください。'
      }, 500, allowedOrigin);
    }
  },
};

function corsResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    },
  });
}
