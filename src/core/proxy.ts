import { ProxyAgent, setGlobalDispatcher } from "undici";

/**
 * 让 Node 内置 fetch 走 HTTP 代理。
 *
 * 背景：Claude Code spawn MCP server 时不继承终端的 HTTPS_PROXY，而 Node 20 的
 * 内置 fetch 本身不读代理环境变量。在 graph.facebook.com 不可直连的网络下，
 * 不做这一步所有平台 API 调用都会超时。
 *
 * 做法上刻意装成全局 dispatcher，而不是给每个平台 client 塞代理参数 ——
 * P4 要求各平台 client 只关心自己的 API，传输层的事在入口处理一次即可，
 * 将来接入 Shopify / Google Ads 自动生效。
 *
 * 已知限制：不处理 NO_PROXY。本 server 只访问固定的几个广告平台 API，
 * 需要直连时不要设置代理环境变量即可。
 */
const PROXY_ENV_KEYS = [
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "HTTP_PROXY",
  "http_proxy",
] as const;

/** 返回实际生效的代理地址；未配置或配置无效时返回 null */
export function installProxyFromEnv(): string | null {
  const proxyUrl = PROXY_ENV_KEYS.map((key) => process.env[key]).find(
    (value) => value && value.trim().length > 0
  );

  if (!proxyUrl) return null;

  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    return proxyUrl;
  } catch (error) {
    console.error(
      `[unified-ads-mcp] Ignoring invalid proxy URL "${proxyUrl}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}
