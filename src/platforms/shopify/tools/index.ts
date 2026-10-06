import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ShopifyClient } from "../client.js";
import { registerShopifyOrderTools } from "./orders.js";
import { registerShopifyCustomerTools } from "./customers.js";

/**
 * Shopify 平台的 tool 注册入口。
 * 新增 tool 文件时在这里挂上即可 —— index.ts 只认这一个函数。
 */
export function registerShopifyTools(
  server: McpServer,
  client: ShopifyClient
): void {
  registerShopifyOrderTools(server, client);
  registerShopifyCustomerTools(server, client);
}
