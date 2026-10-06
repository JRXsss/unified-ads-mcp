import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ShopifyClient } from "../client.js";

// P3: tool 名带平台前缀
// ToolMeta: readOnly=true, destructive=false

/** 统一响应包装 */
function ok(data: unknown, rateLimit: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ...(data as object), _rateLimit: rateLimit }, null, 2),
      },
    ],
  };
}

function fail(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

export function registerShopifyOrderTools(
  server: McpServer,
  client: ShopifyClient
): void {
  // ─── list_shopify_orders ───────────────────────────────────
  server.tool(
    "list_shopify_orders",
    "List orders from the Shopify store. Supports pagination and filtering via Shopify query syntax (e.g. 'financial_status:paid', 'created_at:>2024-01-01').",
    {
      first: z
        .number()
        .int()
        .positive()
        .default(10)
        .describe("Number of orders to return (max 50)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      query: z
        .string()
        .optional()
        .describe(
          "Filter orders using Shopify query syntax, e.g. 'financial_status:paid', 'fulfillment_status:unfulfilled', 'created_at:>2024-01-01'"
        ),
    },
    async ({ first, after, query }) => {
      try {
        const result = await client.query(
          `query ListOrders($first: Int!, $after: String, $query: String) {
            orders(first: $first, after: $after, query: $query) {
              edges {
                cursor
                node {
                  id
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  totalPriceSet {
                    shopMoney { amount currencyCode }
                  }
                  subtotalPriceSet {
                    shopMoney { amount currencyCode }
                  }
                  customer {
                    id
                    firstName
                    lastName
                    defaultEmailAddress { emailAddress }
                  }
                  lineItems(first: 10) {
                    edges {
                      node {
                        title
                        quantity
                        originalUnitPriceSet {
                          shopMoney { amount currencyCode }
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`,
          { first: Math.min(first, 50), after, query }
        );
        return ok(result.data, result.rateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ─── get_shopify_order ─────────────────────────────────────
  server.tool(
    "get_shopify_order",
    "Get details of a specific Shopify order by ID. Returns full order info including line items, customer, shipping address.",
    {
      order_id: z
        .string()
        .describe("Shopify order GID, e.g. 'gid://shopify/Order/123456'"),
    },
    async ({ order_id }) => {
      try {
        const result = await client.query(
          `query GetOrder($id: ID!) {
            order(id: $id) {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney { amount currencyCode }
              }
              subtotalPriceSet {
                shopMoney { amount currencyCode }
              }
              totalTaxSet {
                shopMoney { amount currencyCode }
              }
              customer {
                id
                firstName
                lastName
                defaultEmailAddress { emailAddress }
              }
              lineItems(first: 50) {
                edges {
                  node {
                    title
                    quantity
                    originalUnitPriceSet {
                      shopMoney { amount currencyCode }
                    }
                    sku
                  }
                }
              }
              shippingAddress {
                city
                province
                country
              }
            }
          }`,
          { id: order_id }
        );
        return ok(result.data, result.rateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ─── count_shopify_orders ──────────────────────────────────
  server.tool(
    "count_shopify_orders",
    "Get the total count of orders in the Shopify store. Useful for quick overview without fetching full order data.",
    {
      query: z
        .string()
        .optional()
        .describe(
          "Filter using Shopify query syntax, e.g. 'financial_status:paid created_at:>2024-01-01'"
        ),
    },
    async ({ query }) => {
      try {
        const result = await client.query(
          `query CountOrders($query: String) {
            ordersCount(query: $query) {
              count
            }
          }`,
          { query }
        );
        return ok(result.data, result.rateLimit);
      } catch (error) {
        return fail(error);
      }
    }
  );
}
