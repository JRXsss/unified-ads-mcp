#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { EnvConfigProvider } from "./core/config.js";
import { installProxyFromEnv } from "./core/proxy.js";
import { registerPrompts } from "./prompts/index.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function main(): Promise<void> {
  // 传输层配置必须在任何 fetch 之前就位
  const activeProxy = installProxyFromEnv();

  const server = new McpServer({ name: "unified-ads-mcp", version });
  const configProvider = new EnvConfigProvider();
  const enabled: string[] = [];

  // ── Meta ───────────────────────────────────────────────────
  // P2: 缺凭证则静默跳过（graceful degradation），不报错、不阻断启动
  const metaConfig = configProvider.getConfig("meta");
  if (metaConfig) {
    const { MetaClient } = await import("./platforms/meta/client.js");
    const { loadMetaConfig } = await import("./platforms/meta/config.js");
    const { registerMetaTools } = await import("./platforms/meta/tools/index.js");
    const { registerMetaResources } = await import("./platforms/meta/resources.js");

    const metaClient = new MetaClient(loadMetaConfig(metaConfig));
    registerMetaTools(server, metaClient);
    registerMetaResources(server, metaClient);
    enabled.push("meta");
  }

  // ── Phase 2+ 平台在此按同样模式接入 ─────────────────────────
  // 新增平台无需改动 core/ 或上面任何 Meta 代码：
  //
  // const shopifyConfig = configProvider.getConfig("shopify");
  // if (shopifyConfig) {
  //   const { ShopifyClient } = await import("./platforms/shopify/client.js");
  //   const { registerShopifyTools } = await import("./platforms/shopify/tools/index.js");
  //   registerShopifyTools(server, new ShopifyClient(shopifyConfig));
  //   enabled.push("shopify");
  // }

  registerPrompts(server);

  // stdout 是 MCP 协议通道，日志一律走 stderr
  console.error(
    `[unified-ads-mcp] v${version} — enabled platforms: ${
      enabled.length > 0 ? enabled.join(", ") : "(none — no credentials configured)"
    }${activeProxy ? ` — proxy: ${activeProxy}` : ""}`
  );

  // Transport — Phase 1: stdio；商业化: 按环境变量切到 HTTP/SSE
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
