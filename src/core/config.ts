import { ConfigProvider, PlatformConfig } from "./types.js";

interface PlatformEnvSpec {
  /** 全部存在才启用该平台，缺任意一项 → getConfig 返回 null */
  required: string[];
  /** 存在就一并读取，缺失不影响启用 */
  optional?: string[];
}

/**
 * 新增平台时只需在此登记环境变量，无需改动其他代码。
 * 这是 P2（按配置启用）的唯一配置源。
 */
const PLATFORM_ENV: Record<string, PlatformEnvSpec> = {
  meta: {
    required: ["META_ADS_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    optional: ["META_APP_ID", "META_APP_SECRET"],
  },
  shopify: {
    required: ["SHOPIFY_ACCESS_TOKEN", "SHOPIFY_STORE_URL"],
    // 提供 client 凭证后，ShopifyClient 会自动续期 24 小时 token
    optional: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
  },
  // google: {
  //   required: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"],
  // },
};

/** Phase 1 的配置来源：从环境变量读。~20 行，不增加维护负担。 */
export class EnvConfigProvider implements ConfigProvider {
  constructor(
    private readonly specs: Record<string, PlatformEnvSpec> = PLATFORM_ENV
  ) {}

  getConfig(platform: string): PlatformConfig | null {
    const spec = this.specs[platform];
    if (!spec) return null;

    const credentials: Record<string, string> = {};

    for (const key of spec.required) {
      const value = process.env[key];
      if (!value) return null; // 缺必填项 → 视为未配置
      credentials[key] = value;
    }

    for (const key of spec.optional ?? []) {
      const value = process.env[key];
      if (value) credentials[key] = value;
    }

    return { platform, credentials };
  }
}
