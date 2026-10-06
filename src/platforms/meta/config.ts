import { PlatformConfig } from "../../core/types.js";

export interface MetaConfig {
  accessToken: string;
  adAccountId: string;
  appId: string;
  appSecret: string;
}

/** 把 core 层的通用 PlatformConfig 转成 Meta 专属配置 */
export function buildMetaConfig(platformConfig: PlatformConfig): MetaConfig {
  const c = platformConfig.credentials;
  return {
    accessToken: c.META_ADS_ACCESS_TOKEN ?? "",
    adAccountId: c.META_AD_ACCOUNT_ID ?? "",
    appId: c.META_APP_ID ?? "",
    appSecret: c.META_APP_SECRET ?? "",
  };
}
