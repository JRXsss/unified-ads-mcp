import { PlatformConfig } from "../../core/types.js";

export interface ShopifyConfig {
  accessToken: string;
  storeUrl: string; // e.g. "mystore.myshopify.com"
  /** 可选。提供后 ShopifyClient 会自动续期 24 小时 token */
  clientId: string;
  clientSecret: string;
}

/** 把 core 层的通用 PlatformConfig 转成 Shopify 专属配置 */
export function buildShopifyConfig(platformConfig: PlatformConfig): ShopifyConfig {
  const c = platformConfig.credentials;
  return {
    accessToken: c.SHOPIFY_ACCESS_TOKEN ?? "",
    storeUrl: c.SHOPIFY_STORE_URL ?? "",
    clientId: c.SHOPIFY_CLIENT_ID ?? "",
    clientSecret: c.SHOPIFY_CLIENT_SECRET ?? "",
  };
}
