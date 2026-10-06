import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ShopifyClient } from "./client.js";

/**
 * Shopify MCP resources。
 * URI 带 /shopify/ 段以区分平台（与 Meta 的 ads://meta/... 并列）。
 */
export function registerShopifyResources(
  server: McpServer,
  client: ShopifyClient
): void {
  server.resource(
    "shopify-shop-info",
    "ads://shopify/shop",
    {
      description:
        "Shopify store overview — name, domain, currency, plan, timezone",
      mimeType: "application/json",
    },
    async () => {
      const result = await client.query(
        `query GetShop {
          shop {
            name
            primaryDomain { host }
            currencyCode
            plan { publicDisplayName partnerDevelopment shopifyPlus }
            shopAddress { country }
            timezoneAbbreviation
          }
        }`
      );
      return {
        contents: [
          {
            uri: "ads://shopify/shop",
            mimeType: "application/json",
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    }
  );
}
