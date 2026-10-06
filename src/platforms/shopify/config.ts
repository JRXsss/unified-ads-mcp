import { PlatformConfig } from "../../core/types.js";

export interface ShopifyConfig {
  accessToken: string;
  storeUrl: string; // e.g. "mystore.myshopify.com"
}

/** 把 core 层的通用 PlatformConfig 转成 Shopify 专属配置 */
export function buildShopifyConfig(platformConfig: PlatformConfig): ShopifyConfig {
  const c = platformConfig.credentials;
  return {
    accessToken: c.SHOPIFY_ACCESS_TOKEN ?? "",
    storeUrl: c.SHOPIFY_STORE_URL ?? "",
  };
}
