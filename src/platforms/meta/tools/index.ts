import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../client.js";
import { registerMetaInsightTools } from "./insights.js";
import { registerMetaListTools } from "./campaigns.js";

/**
 * Meta 平台的 tool 注册入口。
 * 新增 tool 文件时在这里挂上即可 —— index.ts 只认这一个函数。
 */
export function registerMetaTools(server: McpServer, client: MetaClient): void {
  registerMetaInsightTools(server, client);
  registerMetaListTools(server, client);
}
