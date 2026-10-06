import { ApiResponse } from "../../core/types.js";
import { ShopifyConfig } from "./config.js";

const API_VERSION = "2026-10";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Shopify Admin GraphQL API 客户端。
 *
 * P4: 每个平台独立 client。Shopify 是 GraphQL，Meta 是 REST，
 * 各自实现，不强行统一。
 */
export class ShopifyClient {
  private readonly endpoint: string;
  private readonly config: ShopifyConfig;

  constructor(config: ShopifyConfig) {
    this.config = config;
    // 标准化 store URL：去掉可能带的 https:// 和尾部 /
    const cleanUrl = config.storeUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    this.endpoint = `https://${cleanUrl}/admin/api/${API_VERSION}/graphql.json`;
  }

  /**
   * 执行 GraphQL 查询。
   *
   * Shopify rate limit 通过响应体中的 extensions.cost 返回，
   * 不在 HTTP header 中。我们把它放到 ApiResponse.rateLimit 位置
   * 以保持和 Meta client 一致的响应结构。
   */
  async query<T = unknown>(
    gql: string,
    variables?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    if (!this.config.accessToken) {
      throw new Error("SHOPIFY_ACCESS_TOKEN is not configured.");
    }

    const body = JSON.stringify({
      query: gql,
      variables: variables ?? {},
    });

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.config.accessToken,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(this.describeNetworkError(error));
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(this.formatHttpError(res.status, text));
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
      extensions?: {
        cost?: {
          requestedQueryCost: number;
          actualQueryCost: number;
          throttleStatus: {
            maximumAvailable: number;
            currentlyAvailable: number;
            restoreRate: number;
          };
        };
      };
    };

    // GraphQL 错误（HTTP 200 但 body 有 errors）
    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => e.message).join("; ");
      const firstCode = json.errors[0]?.extensions?.code;
      let hint = "";
      if (firstCode === "ACCESS_DENIED") {
        hint =
          " Ensure the access token has required scopes (read_orders, read_customers).";
      } else if (firstCode === "THROTTLED") {
        hint = " Query cost exceeded. Wait and retry with smaller page size.";
      }
      throw new Error(`Shopify GraphQL error: ${messages}${hint}`);
    }

    if (!json.data) {
      throw new Error("Shopify GraphQL response missing data field.");
    }

    // 将 Shopify 的 cost-based rate limit 转为统一格式
    const cost = json.extensions?.cost;
    const rateLimit = cost
      ? {
          callCount: cost.actualQueryCost,
          totalCpuTime: cost.requestedQueryCost,
          totalTime: cost.throttleStatus.currentlyAvailable,
        }
      : undefined;

    return { data: json.data, rateLimit };
  }

  private formatHttpError(status: number, body: string): string {
    switch (status) {
      case 401:
        return `[Unauthorized] Shopify API returned 401. Check SHOPIFY_ACCESS_TOKEN is valid.`;
      case 402:
        return `[Payment Required] Shopify API returned 402. Store may be frozen or on an expired trial.`;
      case 403:
        return `[Forbidden] Shopify API returned 403. The app may lack required API scopes.`;
      case 404:
        return `[Not Found] Shopify API returned 404. Check SHOPIFY_STORE_URL is correct (${this.endpoint}).`;
      case 429:
        return `[Rate Limit] Shopify API returned 429. Wait before retrying.`;
      default:
        return `Shopify API error (${status}): ${body.slice(0, 500)}`;
    }
  }

  private describeNetworkError(error: unknown): string {
    const cause =
      error instanceof Error
        ? (error.cause as { code?: string } | undefined)?.code ?? error.message
        : String(error);

    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || cause === "UND_ERR_CONNECT_TIMEOUT");

    if (timedOut) {
      return `[Network Timeout] Shopify API (${this.endpoint}) did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`;
    }

    return `[Network] Cannot reach Shopify API at ${this.endpoint} (${cause}). Check your internet connection.`;
  }

  get storeUrl(): string {
    return this.config.storeUrl;
  }
}
