import { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  SiteBuilderCategoryInput,
  SiteBuilderInput,
  SiteBuilderProductInput,
  SiteBuilderProductVariantInput,
  SiteControlPlanePatchInput,
  SitePlatformInput,
} from "./site-builder-schema";

type SiteBuilderAction = "created" | "reused" | "skipped";

type CategoryRecord = {
  id: string;
  name: string;
  handle: string;
};

type ProductRecord = {
  id: string;
  title: string;
  handle: string;
  status: string;
};

type SalesChannelRecord = {
  id: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

type SitePlatformIntegration = {
  status: "not_configured" | "configuring" | "ready" | "failed";
  provider: string | null;
  external_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
};

type SitePlatformState = {
  domain: {
    hostname: string | null;
    provider: string | null;
    dns_status: "unconfigured" | "pending" | "verified" | "failed";
    ssl_status: "unconfigured" | "pending" | "issued" | "failed";
    connected_at: string | null;
    notes: string | null;
    metadata: Record<string, unknown>;
  };
  deployment: {
    provider: string | null;
    project_id: string | null;
    environment: string | null;
    status: "not_started" | "queued" | "building" | "ready" | "failed";
    url: string | null;
    preview_url: string | null;
    last_deployed_at: string | null;
    notes: string | null;
    metadata: Record<string, unknown>;
  };
  payments: {
    provider: string | null;
    mode: "test" | "live" | null;
    status: "not_configured" | "configuring" | "ready" | "failed";
    account_id: string | null;
    publishable_key: string | null;
    webhook_url: string | null;
    webhook_status: "not_configured" | "pending" | "ready" | "failed";
    notes: string | null;
    metadata: Record<string, unknown>;
  };
  operations: {
    seo: SitePlatformIntegration;
    analytics: SitePlatformIntegration;
    email_marketing: SitePlatformIntegration;
    ads: SitePlatformIntegration;
    crm: SitePlatformIntegration;
    automation: SitePlatformIntegration;
    notes: string | null;
    metadata: Record<string, unknown>;
  };
};

type SiteLaunchReadiness = {
  catalog_ready: boolean;
  domain_ready: boolean;
  storefront_ready: boolean;
  payments_ready: boolean;
  operations_ready: boolean;
  launch_ready: boolean;
  blockers: string[];
  next_steps: string[];
};

type SiteCatalogState = {
  sales_channel_id: string;
  sales_channel_name: string;
  product_count: number;
  product_handles: string[];
  category_count: number;
  category_handles: string[];
  last_synced_at: string;
};

export type SiteBuilderManifest = {
  version: number;
  privilege: "full-admin";
  site: {
    name: string;
    slug: string;
    domain: string | null;
    description: string | null;
    backend_url: string | null;
    design_brief: string | null;
    theme: Record<string, unknown>;
    pages: Array<{
      slug: string;
      title: string;
      prompt?: string;
    }>;
    metadata: Record<string, unknown>;
  };
  admin_api: {
    base_url: string | null;
    site_builder_route: string | null;
    site_list_route: string | null;
    authentication: "Authorization: Basic <secret-api-key>";
  };
  sales_channel: {
    id: string;
    name: string;
    action: SiteBuilderAction;
  };
  publishable_api_key: {
    id: string;
    token: string;
    redacted: string;
    action: SiteBuilderAction;
  } | null;
  categories: Array<{
    id: string;
    name: string;
    handle: string;
    parent: string | null;
    action: SiteBuilderAction;
  }>;
  products: Array<{
    id: string;
    title: string;
    handle: string;
    status: string;
    action: SiteBuilderAction;
  }>;
  catalog: SiteCatalogState;
  platform: SitePlatformState;
  storefront_env: {
    MEDUSA_BACKEND_URL: string | null;
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: string | null;
    SITE_SLUG: string;
  };
  launch_readiness: SiteLaunchReadiness;
  ai_handoff: {
    design_tool_input: {
      site_name: string;
      domain: string | null;
      design_brief: string | null;
      theme: Record<string, unknown>;
      pages: Array<{
        slug: string;
        title: string;
        prompt?: string;
      }>;
      platform: SitePlatformState;
    };
    next_steps: string[];
  };
  timestamps: {
    created_at: string;
    updated_at: string;
  };
};

type BuildSiteManifestOptions = {
  backendUrl?: string | null;
  createdBy?: string;
};

type ListSiteManifestOptions = {
  backendUrl?: string | null;
};

type NormalizedCategoryInput = {
  name: string;
  handle: string;
  description?: string;
  is_active?: boolean;
  is_internal?: boolean;
  parent?: string;
  metadata?: Record<string, unknown>;
};

type NormalizedVariant = {
  title: string;
  sku?: string;
  prices: Array<{
    amount: number;
    currency_code: string;
    min_quantity?: number;
    max_quantity?: number;
  }>;
  options: Record<string, string>;
  manage_inventory?: boolean;
  allow_backorder?: boolean;
  metadata?: Record<string, unknown>;
  weight?: number;
  length?: number;
  height?: number;
  width?: number;
};

type NormalizedProduct = {
  title: string;
  handle: string;
  subtitle?: string;
  description?: string;
  thumbnail?: string;
  images: Array<{ url: string }>;
  categories: string[];
  options: Array<{ title: string; values: string[] }>;
  variants: NormalizedVariant[];
  status: ProductStatus;
  metadata?: Record<string, unknown>;
  discountable?: boolean;
  is_giftcard?: boolean;
  weight?: number;
  length?: number;
  height?: number;
  width?: number;
  material?: string;
  origin_country?: string;
};

type SalesChannelModuleService = {
  listSalesChannels: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<SalesChannelRecord[]>;
  listAndCountSalesChannels?: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<[SalesChannelRecord[], number]>;
  updateSalesChannels: (
    id: string,
    data: Record<string, unknown>
  ) => Promise<SalesChannelRecord>;
};

const SITE_REGISTRY_METADATA_KEY = "ai_site_builder";
const SITE_REGISTRY_VERSION = 2;
const DEFAULT_OPTION_TITLE = "Title";
const DEFAULT_OPTION_VALUE = "Default";

export async function buildSiteManifest(
  container: MedusaContainer,
  input: SiteBuilderInput,
  options: BuildSiteManifestOptions = {}
): Promise<SiteBuilderManifest> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(
    Modules.SALES_CHANNEL
  ) as SalesChannelModuleService;

  const siteSlug = slugify(input.site.slug ?? input.site.name);
  const salesChannelName = `${input.site.name} (${siteSlug})`;
  const backendUrl = resolveBackendUrl(options.backendUrl, input.site.backend_url);

  logger.info(`Building site manifest for ${siteSlug}`);

  let salesChannelAction: SiteBuilderAction = "created";
  let salesChannel: SalesChannelRecord | null = null;
  let existingSiteRecord: SiteBuilderManifest | null = null;

  if (input.options.reuse_sales_channel) {
    const existingChannels = await salesChannelModuleService.listSalesChannels({
      name: salesChannelName,
    });
    const existingChannel = existingChannels[0];
    if (existingChannel) {
      salesChannel = existingChannel;
      existingSiteRecord = normalizeStoredSiteManifest(existingChannel, backendUrl);
    }
  }

  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: salesChannelName,
            description: input.site.description ?? null,
          },
        ],
      },
    });

    salesChannel = {
      id: result[0].id,
      name: result[0].name,
      description: input.site.description ?? null,
      metadata: {},
    };
  } else {
    salesChannelAction = "reused";
  }

  if (!salesChannel) {
    throw new Error("Failed to resolve sales channel.");
  }

  const stockLocationId = await ensureSalesChannelStockLocationLink(
    container,
    query,
    salesChannel.id
  );

  let publishableApiKey: SiteBuilderManifest["publishable_api_key"] = null;

  if (input.options.create_publishable_key) {
    if (existingSiteRecord?.publishable_api_key) {
      publishableApiKey = {
        ...existingSiteRecord.publishable_api_key,
        action: "reused",
      };
    } else {
      const { result } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: `${input.site.name} Storefront`,
              type: "publishable",
              created_by: options.createdBy ?? "",
            },
          ],
        },
      });

      const apiKey = result[0];

      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: {
          id: apiKey.id,
          add: [salesChannel.id],
        },
      });

      publishableApiKey = {
        id: apiKey.id,
        token: apiKey.token,
        redacted: apiKey.redacted,
        action: "created",
      };
    }
  } else if (existingSiteRecord?.publishable_api_key) {
    publishableApiKey = {
      ...existingSiteRecord.publishable_api_key,
      action: "reused",
    };
  }

  const shippingProfileId = await resolveShippingProfileId(
    container,
    fulfillmentModuleService,
    input.defaults.shipping_profile_id
  );

  const categoryInputs = collectCategoryInputs(input);
  const categoryRecords = await ensureCategories(container, query, categoryInputs);
  const categoryMap = new Map(
    categoryRecords.map((entry) => [entry.record.handle, entry.record])
  );

  const productSummaries: SiteBuilderManifest["products"] = [];

  for (const rawProduct of input.products) {
    const product = normalizeProduct(
      rawProduct,
      input.defaults.currency_code,
      input.defaults.status
    );
    const existingProduct = input.options.skip_existing_products
      ? await findProductByHandle(query, product.handle)
      : null;

    if (existingProduct) {
      productSummaries.push({
        id: existingProduct.id,
        title: existingProduct.title,
        handle: existingProduct.handle,
        status: existingProduct.status,
        action: "reused",
      });
      continue;
    }

    const categoryIds = product.categories
      .map((category) => categoryMap.get(slugify(category))?.id)
      .filter((categoryId): categoryId is string => Boolean(categoryId));

    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: product.title,
            subtitle: product.subtitle,
            description: product.description,
            thumbnail: product.thumbnail,
            images: product.images,
            handle: product.handle,
            status: product.status,
            category_ids: categoryIds,
            options: product.options,
            variants: product.variants,
            shipping_profile_id: shippingProfileId,
            sales_channels: [{ id: salesChannel.id }],
            metadata: {
              site_slug: siteSlug,
              site_name: input.site.name,
              ...(product.metadata ?? {}),
            },
            discountable: product.discountable,
            is_giftcard: product.is_giftcard,
            weight: product.weight,
            length: product.length,
            height: product.height,
            width: product.width,
            material: product.material,
            origin_country: product.origin_country,
          },
        ],
      },
    });

    const createdProduct = result[0];

    productSummaries.push({
      id: createdProduct.id,
      title: createdProduct.title,
      handle: createdProduct.handle ?? product.handle,
      status: createdProduct.status,
      action: "created",
    });

    if (stockLocationId) {
      await ensureInventoryLevelsForProduct(
        container,
        query,
        createdProduct.id,
        stockLocationId
      );
    }
  }

  const now = new Date().toISOString();
  const categoryHandles = uniqueStrings([
    ...(existingSiteRecord?.catalog.category_handles ?? []),
    ...categoryRecords.map((entry) => entry.record.handle),
  ]);
  const productHandles = uniqueStrings([
    ...(existingSiteRecord?.catalog.product_handles ?? []),
    ...productSummaries.map((entry) => entry.handle),
  ]);

  const platform = buildPlatformState(input.platform, existingSiteRecord, {
    backendUrl,
    domain: input.site.domain ?? existingSiteRecord?.site.domain ?? null,
    publishableApiKey: publishableApiKey?.token ?? existingSiteRecord?.publishable_api_key?.token ?? null,
  });

  const manifest: SiteBuilderManifest = {
    version: SITE_REGISTRY_VERSION,
    privilege: "full-admin",
    site: {
      name: input.site.name,
      slug: siteSlug,
      domain: input.site.domain ?? existingSiteRecord?.site.domain ?? null,
      description:
        input.site.description ??
        existingSiteRecord?.site.description ??
        salesChannel.description ??
        null,
      backend_url: backendUrl,
      design_brief:
        input.site.design_brief ?? existingSiteRecord?.site.design_brief ?? null,
      theme: {
        ...(existingSiteRecord?.site.theme ?? {}),
        ...(input.site.theme ?? {}),
      },
      pages: input.site.pages ?? existingSiteRecord?.site.pages ?? [],
      metadata: {
        ...(existingSiteRecord?.site.metadata ?? {}),
        ...(input.site.metadata ?? {}),
      },
    },
    admin_api: buildAdminApiState(backendUrl),
    sales_channel: {
      id: salesChannel.id,
      name: salesChannel.name,
      action: salesChannelAction,
    },
    publishable_api_key: publishableApiKey,
    categories: categoryRecords.map((entry) => ({
      id: entry.record.id,
      name: entry.record.name,
      handle: entry.record.handle,
      parent: entry.parent ?? null,
      action: entry.action,
    })),
    products: productSummaries,
    catalog: {
      sales_channel_id: salesChannel.id,
      sales_channel_name: salesChannel.name,
      product_count: productHandles.length,
      product_handles: productHandles,
      category_count: categoryHandles.length,
      category_handles: categoryHandles,
      last_synced_at: now,
    },
    platform,
    storefront_env: {
      MEDUSA_BACKEND_URL: backendUrl,
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: publishableApiKey?.token ?? null,
      SITE_SLUG: siteSlug,
    },
    launch_readiness: {
      catalog_ready: false,
      domain_ready: false,
      storefront_ready: false,
      payments_ready: false,
      operations_ready: false,
      launch_ready: false,
      blockers: [],
      next_steps: [],
    },
    ai_handoff: {
      design_tool_input: {
        site_name: input.site.name,
        domain: input.site.domain ?? existingSiteRecord?.site.domain ?? null,
        design_brief:
          input.site.design_brief ?? existingSiteRecord?.site.design_brief ?? null,
        theme: {
          ...(existingSiteRecord?.site.theme ?? {}),
          ...(input.site.theme ?? {}),
        },
        pages: input.site.pages ?? existingSiteRecord?.site.pages ?? [],
        platform,
      },
      next_steps: [],
    },
    timestamps: {
      created_at: existingSiteRecord?.timestamps.created_at ?? now,
      updated_at: now,
    },
  };

  manifest.launch_readiness = computeLaunchReadiness(manifest);
  manifest.ai_handoff.next_steps = buildAiNextSteps(manifest);

  await persistSiteManifest(
    container,
    salesChannel,
    manifest,
    manifest.site.name,
    manifest.site.description
  );

  return manifest;
}

export async function listSiteManifests(
  container: MedusaContainer,
  options: ListSiteManifestOptions = {}
): Promise<SiteBuilderManifest[]> {
  const salesChannelModuleService = container.resolve(
    Modules.SALES_CHANNEL
  ) as SalesChannelModuleService;
  const channels = await listAllSalesChannels(salesChannelModuleService);

  return channels
    .map((channel) =>
      normalizeStoredSiteManifest(channel, options.backendUrl ?? null)
    )
    .filter(Boolean)
    .sort((left, right) =>
      right!.timestamps.updated_at.localeCompare(left!.timestamps.updated_at)
    ) as SiteBuilderManifest[];
}

export async function retrieveSiteManifest(
  container: MedusaContainer,
  reference: string,
  options: ListSiteManifestOptions = {}
): Promise<SiteBuilderManifest | null> {
  const salesChannelModuleService = container.resolve(
    Modules.SALES_CHANNEL
  ) as SalesChannelModuleService;
  const match = await resolveSiteChannelByReference(
    salesChannelModuleService,
    reference
  );

  if (!match) {
    return null;
  }

  return normalizeStoredSiteManifest(match, options.backendUrl ?? null);
}

export async function updateSiteManifest(
  container: MedusaContainer,
  reference: string,
  patch: SiteControlPlanePatchInput,
  options: ListSiteManifestOptions = {}
): Promise<SiteBuilderManifest> {
  const salesChannelModuleService = container.resolve(
    Modules.SALES_CHANNEL
  ) as SalesChannelModuleService;
  const salesChannel = await resolveSiteChannelByReference(
    salesChannelModuleService,
    reference
  );

  if (!salesChannel) {
    throw new Error(`Unknown site reference: ${reference}`);
  }

  const existing = normalizeStoredSiteManifest(
    salesChannel,
    options.backendUrl ?? null
  );

  if (!existing) {
    throw new Error(`Site control-plane record not found for: ${reference}`);
  }

  const now = new Date().toISOString();
  const backendUrl =
    patch.site?.backend_url === null
      ? null
      : patch.site?.backend_url ?? existing.site.backend_url ?? options.backendUrl ?? null;

  const siteName = patch.site?.name ?? existing.site.name;
  const description =
    patch.site?.description === undefined
      ? existing.site.description
      : patch.site.description;
  const domain =
    patch.site?.domain === undefined ? existing.site.domain : patch.site.domain;
  const designBrief =
    patch.site?.design_brief === undefined
      ? existing.site.design_brief
      : patch.site.design_brief;

  const manifest: SiteBuilderManifest = {
    ...existing,
    version: SITE_REGISTRY_VERSION,
    site: {
      ...existing.site,
      name: siteName,
      domain,
      description,
      backend_url: backendUrl,
      design_brief: designBrief,
      theme: patch.site?.theme
        ? {
            ...existing.site.theme,
            ...patch.site.theme,
          }
        : existing.site.theme,
      pages: patch.site?.pages ?? existing.site.pages,
      metadata: patch.site?.metadata
        ? {
            ...existing.site.metadata,
            ...patch.site.metadata,
          }
        : existing.site.metadata,
    },
    admin_api: buildAdminApiState(backendUrl),
    sales_channel: {
      ...existing.sales_channel,
      name: `${siteName} (${existing.site.slug})`,
      action: "reused",
    },
    publishable_api_key: existing.publishable_api_key
      ? {
          ...existing.publishable_api_key,
          action: "reused",
        }
      : null,
    platform: buildPlatformState(patch.platform, existing, {
      backendUrl,
      domain,
      publishableApiKey:
        existing.publishable_api_key?.token ??
        existing.platform.payments.publishable_key ??
        null,
    }),
    storefront_env: {
      ...existing.storefront_env,
      MEDUSA_BACKEND_URL: backendUrl,
    },
    timestamps: {
      created_at: existing.timestamps.created_at,
      updated_at: now,
    },
  };

  manifest.launch_readiness = computeLaunchReadiness(manifest);
  manifest.ai_handoff = {
    design_tool_input: {
      site_name: manifest.site.name,
      domain: manifest.site.domain,
      design_brief: manifest.site.design_brief,
      theme: manifest.site.theme,
      pages: manifest.site.pages,
      platform: manifest.platform,
    },
    next_steps: buildAiNextSteps(manifest),
  };

  await persistSiteManifest(
    container,
    salesChannel,
    manifest,
    manifest.site.name,
    manifest.site.description
  );

  return manifest;
}

function buildAdminApiState(backendUrl: string | null) {
  return {
    base_url: backendUrl,
    site_builder_route: backendUrl ? `${backendUrl}/admin/site-builder` : null,
    site_list_route: backendUrl
      ? `${backendUrl}/admin/site-builder/sites`
      : null,
    authentication: "Authorization: Basic <secret-api-key>" as const,
  };
}

function buildPlatformState(
  input: Partial<SitePlatformInput> | undefined,
  existing: SiteBuilderManifest | null,
  context: {
    backendUrl: string | null;
    domain: string | null;
    publishableApiKey: string | null;
  }
): SitePlatformState {
  const stripeConfigured =
    Boolean(process.env.STRIPE_API_KEY) &&
    Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const existingPlatform = existing?.platform;
  const inputDomain = input?.domain;
  const inputDeployment = input?.deployment;
  const inputPayments = input?.payments;
  const inputOperations = input?.operations;
  const domainHostname =
    inputDomain?.hostname ??
    context.domain ??
    existingPlatform?.domain.hostname ??
    null;

  const paymentsProvider =
    inputPayments?.provider ??
    existingPlatform?.payments.provider ??
    (stripeConfigured ? "stripe" : null);
  const webhookUrl =
    inputPayments?.webhook_url ??
    existingPlatform?.payments.webhook_url ??
    (paymentsProvider === "stripe" && context.backendUrl
      ? `${context.backendUrl}/hooks/payment/stripe_stripe`
      : null);
  const paymentsPublishableKey =
    inputPayments?.publishable_key ??
    existingPlatform?.payments.publishable_key ??
    context.publishableApiKey;

  return {
    domain: {
      hostname: domainHostname,
      provider:
        inputDomain?.provider ?? existingPlatform?.domain.provider ?? null,
      dns_status:
        inputDomain?.dns_status ??
        existingPlatform?.domain.dns_status ??
        (domainHostname ? "pending" : "unconfigured"),
      ssl_status:
        inputDomain?.ssl_status ??
        existingPlatform?.domain.ssl_status ??
        (domainHostname ? "pending" : "unconfigured"),
      connected_at:
        inputDomain?.connected_at ??
        existingPlatform?.domain.connected_at ??
        null,
      notes: inputDomain?.notes ?? existingPlatform?.domain.notes ?? null,
      metadata: {
        ...(existingPlatform?.domain.metadata ?? {}),
        ...(inputDomain?.metadata ?? {}),
      },
    },
    deployment: {
      provider:
        inputDeployment?.provider ??
        existingPlatform?.deployment.provider ??
        "dokploy",
      project_id:
        inputDeployment?.project_id ??
        existingPlatform?.deployment.project_id ??
        null,
      environment:
        inputDeployment?.environment ??
        existingPlatform?.deployment.environment ??
        "production",
      status:
        inputDeployment?.status ??
        existingPlatform?.deployment.status ??
        "not_started",
      url: inputDeployment?.url ?? existingPlatform?.deployment.url ?? null,
      preview_url:
        inputDeployment?.preview_url ??
        existingPlatform?.deployment.preview_url ??
        null,
      last_deployed_at:
        inputDeployment?.last_deployed_at ??
        existingPlatform?.deployment.last_deployed_at ??
        null,
      notes:
        inputDeployment?.notes ?? existingPlatform?.deployment.notes ?? null,
      metadata: {
        ...(existingPlatform?.deployment.metadata ?? {}),
        ...(inputDeployment?.metadata ?? {}),
      },
    },
    payments: {
      provider: paymentsProvider,
      mode:
        inputPayments?.mode ??
        existingPlatform?.payments.mode ??
        (stripeConfigured ? "test" : null),
      status:
        inputPayments?.status ??
        existingPlatform?.payments.status ??
        (stripeConfigured ? "configuring" : "not_configured"),
      account_id:
        inputPayments?.account_id ?? existingPlatform?.payments.account_id ?? null,
      publishable_key: paymentsPublishableKey,
      webhook_url: webhookUrl,
      webhook_status:
        inputPayments?.webhook_status ??
        existingPlatform?.payments.webhook_status ??
        (paymentsProvider === "stripe" && webhookUrl
          ? "pending"
          : "not_configured"),
      notes: inputPayments?.notes ?? existingPlatform?.payments.notes ?? null,
      metadata: {
        ...(existingPlatform?.payments.metadata ?? {}),
        ...(inputPayments?.metadata ?? {}),
      },
    },
    operations: {
      seo: buildIntegrationState(
        inputOperations?.seo,
        existingPlatform?.operations.seo
      ),
      analytics: buildIntegrationState(
        inputOperations?.analytics,
        existingPlatform?.operations.analytics
      ),
      email_marketing: buildIntegrationState(
        inputOperations?.email_marketing,
        existingPlatform?.operations.email_marketing
      ),
      ads: buildIntegrationState(
        inputOperations?.ads,
        existingPlatform?.operations.ads
      ),
      crm: buildIntegrationState(
        inputOperations?.crm,
        existingPlatform?.operations.crm
      ),
      automation: buildIntegrationState(
        inputOperations?.automation,
        existingPlatform?.operations.automation
      ),
      notes:
        inputOperations?.notes ?? existingPlatform?.operations.notes ?? null,
      metadata: {
        ...(existingPlatform?.operations.metadata ?? {}),
        ...(inputOperations?.metadata ?? {}),
      },
    },
  };
}

function buildIntegrationState(
  input: Record<string, unknown> | undefined,
  existing: SitePlatformIntegration | undefined
): SitePlatformIntegration {
  const data = input ?? {};
  const status = asIntegrationStatus(data.status);

  return {
    status: status ?? existing?.status ?? "not_configured",
    provider: asString(data.provider) ?? existing?.provider ?? null,
    external_id: asString(data.external_id) ?? existing?.external_id ?? null,
    notes: asString(data.notes) ?? existing?.notes ?? null,
    metadata: {
      ...(existing?.metadata ?? {}),
      ...(asRecord(data.metadata) ?? {}),
    },
  };
}

function computeLaunchReadiness(
  manifest: SiteBuilderManifest
): SiteLaunchReadiness {
  const blockers: string[] = [];
  const nextSteps: string[] = [];
  const stripeConfigured =
    Boolean(process.env.STRIPE_API_KEY) &&
    Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  const catalogReady =
    manifest.catalog.product_count > 0 &&
    Boolean(manifest.publishable_api_key?.token);
  const domainReady =
    Boolean(manifest.platform.domain.hostname) &&
    manifest.platform.domain.dns_status === "verified" &&
    manifest.platform.domain.ssl_status === "issued";
  const storefrontReady =
    manifest.platform.deployment.status === "ready" &&
    Boolean(manifest.platform.deployment.url);
  const paymentsReady = manifest.platform.payments.status === "ready";
  const operationsReady =
    manifest.platform.operations.analytics.status === "ready" ||
    manifest.platform.operations.seo.status === "ready" ||
    manifest.platform.operations.automation.status === "ready";

  if (!catalogReady) {
    blockers.push("Catalog is not ready. Create products and a publishable storefront key.");
    nextSteps.push("Add at least one published product and expose the publishable API key to the storefront.");
  }

  if (!domainReady) {
    blockers.push("Custom domain is not verified with DNS and SSL.");
    nextSteps.push("Point the domain to the storefront deployment, then mark DNS and SSL as verified.");
  }

  if (!storefrontReady) {
    blockers.push("Storefront deployment is not marked ready.");
    nextSteps.push("Deploy the storefront and update platform.deployment.status/url when it is live.");
  }

  if (!paymentsReady) {
    if (manifest.platform.payments.provider === "stripe" && !stripeConfigured) {
      blockers.push("Stripe is selected but the backend Stripe provider is not configured.");
      nextSteps.push("Set STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET, redeploy the backend, and enable Stripe on the region.");
    } else {
      blockers.push("Payments are not marked ready.");
      nextSteps.push("Connect the payment provider, confirm webhook delivery, and update platform.payments.status.");
    }
  }

  if (!operationsReady) {
    nextSteps.push("Optional: connect analytics, SEO, CRM, or automation integrations for post-launch operations.");
  }

  return {
    catalog_ready: catalogReady,
    domain_ready: domainReady,
    storefront_ready: storefrontReady,
    payments_ready: paymentsReady,
    operations_ready: operationsReady,
    launch_ready: catalogReady && domainReady && storefrontReady && paymentsReady,
    blockers: uniqueStrings(blockers),
    next_steps: uniqueStrings(nextSteps),
  };
}

function buildAiNextSteps(manifest: SiteBuilderManifest): string[] {
  const steps = [
    "Use ai_handoff.design_tool_input to generate or update the storefront UI.",
    "Apply storefront_env to the frontend deployment.",
    "Keep the storefront bound to this site's sales channel catalog.",
    ...manifest.launch_readiness.next_steps,
  ];

  return uniqueStrings(steps);
}

async function persistSiteManifest(
  container: MedusaContainer,
  salesChannel: SalesChannelRecord,
  manifest: SiteBuilderManifest,
  siteName: string,
  description: string | null
): Promise<void> {
  const salesChannelModuleService = container.resolve(
    Modules.SALES_CHANNEL
  ) as SalesChannelModuleService;
  const existingMetadata = salesChannel.metadata ?? {};

  await salesChannelModuleService.updateSalesChannels(salesChannel.id, {
    name: `${siteName} (${manifest.site.slug})`,
    description,
    metadata: {
      ...existingMetadata,
      [SITE_REGISTRY_METADATA_KEY]: manifest,
    },
  });
}

async function resolveSiteChannelByReference(
  salesChannelModuleService: SalesChannelModuleService,
  reference: string
): Promise<SalesChannelRecord | null> {
  const normalizedReference = reference.trim().toLowerCase();
  const channels = await listAllSalesChannels(salesChannelModuleService);

  for (const channel of channels) {
    const record = normalizeStoredSiteManifest(channel, null);

    if (
      channel.id === reference ||
      channel.name.toLowerCase() === normalizedReference ||
      record?.site.slug === normalizedReference ||
      record?.site.domain?.toLowerCase() === normalizedReference
    ) {
      return channel;
    }
  }

  return null;
}

async function listAllSalesChannels(
  salesChannelModuleService: SalesChannelModuleService
): Promise<SalesChannelRecord[]> {
  if (salesChannelModuleService.listAndCountSalesChannels) {
    const all: SalesChannelRecord[] = [];
    let skip = 0;
    const take = 100;
    let total = 0;

    do {
      const [batch, count] =
        await salesChannelModuleService.listAndCountSalesChannels(
          {},
          {
            take,
            skip,
          }
        );
      all.push(...batch);
      total = count;
      skip += batch.length;
    } while (skip < total);

    return all;
  }

  return salesChannelModuleService.listSalesChannels({}, { take: 500 });
}

function normalizeStoredSiteManifest(
  salesChannel: SalesChannelRecord,
  backendUrl: string | null
): SiteBuilderManifest | null {
  const metadata = salesChannel.metadata ?? {};
  const raw = asRecord(metadata[SITE_REGISTRY_METADATA_KEY]);

  if (!raw) {
    return null;
  }

  const site = asRecord(raw.site);

  if (!site || !asString(site.name) || !asString(site.slug)) {
    return null;
  }

  const categories = normalizeCategorySummaries(raw.categories);
  const products = normalizeProductSummaries(raw.products);
  const publishableApiKey = normalizePublishableApiKey(raw.publishable_api_key);
  const resolvedBackendUrl =
    asString(site.backend_url) ?? backendUrl ?? process.env.MEDUSA_BACKEND_URL ?? null;
  const record: SiteBuilderManifest = {
    version: SITE_REGISTRY_VERSION,
    privilege: "full-admin",
    site: {
      name: asString(site.name) ?? salesChannel.name,
      slug: asString(site.slug) ?? slugify(salesChannel.name),
      domain: asString(site.domain),
      description:
        asNullableString(site.description) ?? salesChannel.description ?? null,
      backend_url: resolvedBackendUrl,
      design_brief: asNullableString(site.design_brief),
      theme: asRecord(site.theme) ?? {},
      pages: normalizePages(site.pages),
      metadata: asRecord(site.metadata) ?? {},
    },
    admin_api: buildAdminApiState(resolvedBackendUrl),
    sales_channel: {
      id: salesChannel.id,
      name: salesChannel.name,
      action: "reused",
    },
    publishable_api_key: publishableApiKey,
    categories,
    products,
    catalog: normalizeCatalog(raw.catalog, salesChannel, categories, products),
    platform: buildPlatformState(asRecord(raw.platform) ?? {}, null, {
      backendUrl: resolvedBackendUrl,
      domain: asString(site.domain),
      publishableApiKey: publishableApiKey?.token ?? null,
    }),
    storefront_env: {
      MEDUSA_BACKEND_URL: resolvedBackendUrl,
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: publishableApiKey?.token ?? null,
      SITE_SLUG: asString(site.slug) ?? slugify(salesChannel.name),
    },
    launch_readiness: {
      catalog_ready: false,
      domain_ready: false,
      storefront_ready: false,
      payments_ready: false,
      operations_ready: false,
      launch_ready: false,
      blockers: [],
      next_steps: [],
    },
    ai_handoff: {
      design_tool_input: {
        site_name: asString(site.name) ?? salesChannel.name,
        domain: asString(site.domain),
        design_brief: asNullableString(site.design_brief),
        theme: asRecord(site.theme) ?? {},
        pages: normalizePages(site.pages),
        platform: buildPlatformState(asRecord(raw.platform) ?? {}, null, {
          backendUrl: resolvedBackendUrl,
          domain: asString(site.domain),
          publishableApiKey: publishableApiKey?.token ?? null,
        }),
      },
      next_steps: [],
    },
    timestamps: normalizeTimestamps(raw.timestamps),
  };

  record.launch_readiness = computeLaunchReadiness(record);
  record.ai_handoff.next_steps = buildAiNextSteps(record);

  return record;
}

function normalizeCatalog(
  rawCatalog: unknown,
  salesChannel: SalesChannelRecord,
  categories: SiteBuilderManifest["categories"],
  products: SiteBuilderManifest["products"]
): SiteCatalogState {
  const catalog = asRecord(rawCatalog);
  const productHandles = uniqueStrings([
    ...asStringArray(catalog?.product_handles),
    ...products.map((entry) => entry.handle),
  ]);
  const categoryHandles = uniqueStrings([
    ...asStringArray(catalog?.category_handles),
    ...categories.map((entry) => entry.handle),
  ]);

  return {
    sales_channel_id:
      asString(catalog?.sales_channel_id) ?? salesChannel.id,
    sales_channel_name:
      asString(catalog?.sales_channel_name) ?? salesChannel.name,
    product_count:
      asNumber(catalog?.product_count) ?? productHandles.length,
    product_handles: productHandles,
    category_count:
      asNumber(catalog?.category_count) ?? categoryHandles.length,
    category_handles: categoryHandles,
    last_synced_at:
      asString(catalog?.last_synced_at) ?? new Date().toISOString(),
  };
}

function normalizePages(input: unknown): SiteBuilderManifest["site"]["pages"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((page) => {
      const record = asRecord(page);
      const slug = asString(record?.slug);
      const title = asString(record?.title);

      if (!slug || !title) {
        return null;
      }

      return {
        slug,
        title,
        prompt: asString(record?.prompt) ?? undefined,
      };
    })
    .filter(Boolean) as SiteBuilderManifest["site"]["pages"];
}

function normalizeCategorySummaries(
  input: unknown
): SiteBuilderManifest["categories"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      const record = asRecord(entry);
      const id = asString(record?.id);
      const name = asString(record?.name);
      const handle = asString(record?.handle);

      if (!id || !name || !handle) {
        return null;
      }

      return {
        id,
        name,
        handle,
        parent: asNullableString(record?.parent),
        action: normalizeAction(record?.action),
      };
    })
    .filter(Boolean) as SiteBuilderManifest["categories"];
}

function normalizeProductSummaries(
  input: unknown
): SiteBuilderManifest["products"] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      const record = asRecord(entry);
      const id = asString(record?.id);
      const title = asString(record?.title ?? record?.name);
      const handle = asString(record?.handle);

      if (!id || !title || !handle) {
        return null;
      }

      return {
        id,
        title,
        handle,
        status: asString(record?.status) ?? "draft",
        action: normalizeAction(record?.action),
      };
    })
    .filter(Boolean) as SiteBuilderManifest["products"];
}

function normalizePublishableApiKey(
  input: unknown
): SiteBuilderManifest["publishable_api_key"] {
  const record = asRecord(input);

  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const token = asString(record.token);
  const redacted = asString(record.redacted);

  if (!id || !token || !redacted) {
    return null;
  }

  return {
    id,
    token,
    redacted,
    action: normalizeAction(record.action),
  };
}

function normalizeTimestamps(input: unknown): SiteBuilderManifest["timestamps"] {
  const record = asRecord(input);
  const now = new Date().toISOString();

  return {
    created_at: asString(record?.created_at) ?? now,
    updated_at: asString(record?.updated_at) ?? now,
  };
}

function normalizeAction(input: unknown): SiteBuilderAction {
  return input === "created" || input === "reused" || input === "skipped"
    ? input
    : "reused";
}

function resolveBackendUrl(
  overrideUrl?: string | null,
  inputUrl?: string | null
): string | null {
  return (
    overrideUrl ??
    inputUrl ??
    process.env.SITE_BUILDER_BACKEND_URL ??
    process.env.MEDUSA_BACKEND_URL ??
    null
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function collectCategoryInputs(input: SiteBuilderInput): NormalizedCategoryInput[] {
  const categories = new Map<string, NormalizedCategoryInput>();

  for (const category of input.categories) {
    const normalized = normalizeCategory(category);
    categories.set(normalized.handle, normalized);
  }

  for (const product of input.products) {
    for (const categoryName of product.categories ?? []) {
      const handle = slugify(categoryName);
      if (!categories.has(handle)) {
        categories.set(handle, {
          name: categoryName,
          handle,
          is_active: true,
        });
      }
    }
  }

  return Array.from(categories.values());
}

function normalizeCategory(input: SiteBuilderCategoryInput): NormalizedCategoryInput {
  if (typeof input === "string") {
    return {
      name: input,
      handle: slugify(input),
      is_active: true,
    };
  }

  return {
    name: input.name,
    handle: slugify(input.handle ?? input.name),
    description: input.description,
    is_active: input.is_active ?? true,
    is_internal: input.is_internal,
    parent: input.parent ? slugify(input.parent) : undefined,
    metadata: input.metadata,
  };
}

function normalizeProduct(
  input: SiteBuilderProductInput,
  defaultCurrencyCode: string,
  defaultStatus: ProductStatus
): NormalizedProduct {
  const handle = slugify(input.handle ?? input.title);
  const variants = normalizeVariants(input, defaultCurrencyCode);
  const options = normalizeOptions(input, variants);
  const images = (input.images ?? []).map((image) =>
    typeof image === "string" ? { url: image } : image
  );

  return {
    title: input.title,
    handle,
    subtitle: input.subtitle,
    description: input.description,
    thumbnail: input.thumbnail ?? images[0]?.url,
    images,
    categories: input.categories ?? [],
    options,
    variants,
    status: input.status ?? defaultStatus,
    metadata: input.metadata,
    discountable: input.discountable,
    is_giftcard: input.is_giftcard,
    weight: input.weight,
    length: input.length,
    height: input.height,
    width: input.width,
    material: input.material,
    origin_country: input.origin_country?.toLowerCase(),
  };
}

function normalizeOptions(
  input: SiteBuilderProductInput,
  variants: NormalizedVariant[]
): Array<{ title: string; values: string[] }> {
  if (input.options?.length) {
    return input.options.map((option) => ({
      title: option.title,
      values: option.values,
    }));
  }

  const valuesByTitle = new Map<string, Set<string>>();

  for (const variant of variants) {
    for (const [title, value] of Object.entries(variant.options)) {
      const existing = valuesByTitle.get(title) ?? new Set<string>();
      existing.add(value);
      valuesByTitle.set(title, existing);
    }
  }

  if (!valuesByTitle.size) {
    return [
      {
        title: DEFAULT_OPTION_TITLE,
        values: [DEFAULT_OPTION_VALUE],
      },
    ];
  }

  return Array.from(valuesByTitle.entries()).map(([title, values]) => ({
    title,
    values: Array.from(values),
  }));
}

function normalizeVariants(
  input: SiteBuilderProductInput,
  defaultCurrencyCode: string
): NormalizedVariant[] {
  if (input.variants?.length) {
    return input.variants.map((variant) =>
      normalizeVariant(variant, defaultCurrencyCode)
    );
  }

  return [
    {
      title: DEFAULT_OPTION_VALUE,
      options: {
        [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE,
      },
      prices: (input.prices ?? []).map((price) => ({
        ...price,
        currency_code: price.currency_code.toLowerCase(),
      })),
    },
  ];
}

function normalizeVariant(
  input: SiteBuilderProductVariantInput,
  defaultCurrencyCode: string
): NormalizedVariant {
  const options =
    input.options && Object.keys(input.options).length
      ? Object.fromEntries(
          Object.entries(input.options).map(([key, value]) => [key, value])
        )
      : {
          [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE,
        };

  return {
    title: input.title,
    sku: input.sku,
    options,
    prices: input.prices.map((price) => ({
      ...price,
      currency_code: (price.currency_code || defaultCurrencyCode).toLowerCase(),
    })),
    manage_inventory: input.manage_inventory,
    allow_backorder: input.allow_backorder,
    metadata: input.metadata,
    weight: input.weight,
    length: input.length,
    height: input.height,
    width: input.width,
  };
}

async function resolveShippingProfileId(
  container: MedusaContainer,
  fulfillmentModuleService: {
    listShippingProfiles: (
      filters: Record<string, unknown>
    ) => Promise<Array<{ id: string }>>;
  },
  shippingProfileId?: string
): Promise<string> {
  if (shippingProfileId) {
    return shippingProfileId;
  }

  const profiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });

  if (profiles[0]?.id) {
    return profiles[0].id;
  }

  const { result } = await createShippingProfilesWorkflow(container).run({
    input: {
      data: [
        {
          name: "Default Shipping Profile",
          type: "default",
        },
      ],
    },
  });

  return result[0].id;
}

async function ensureSalesChannelStockLocationLink(
  container: MedusaContainer,
  query: {
    graph: (input: {
      entity: string;
      fields: string[];
      filters?: Record<string, unknown>;
    }) => Promise<{ data: Array<Record<string, unknown>> }>;
  },
  salesChannelId: string
): Promise<string | null> {
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["default_location_id"],
  });
  const stockLocationId =
    (stores[0]?.default_location_id as string | undefined | null) ?? null;

  if (!stockLocationId) {
    return null;
  }

  const { data: existingLinks } = await query.graph({
    entity: "sales_channel_locations",
    fields: ["sales_channel_id", "stock_location_id"],
    filters: {
      sales_channel_id: salesChannelId,
      stock_location_id: stockLocationId,
    },
  });

  if (existingLinks.length) {
    return stockLocationId;
  }

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocationId,
      add: [salesChannelId],
    },
  });

  return stockLocationId;
}

async function ensureInventoryLevelsForProduct(
  container: MedusaContainer,
  query: {
    graph: (input: {
      entity: string;
      fields: string[];
      filters?: Record<string, unknown>;
    }) => Promise<{ data: Array<Record<string, unknown>> }>;
  },
  productId: string,
  stockLocationId: string
): Promise<void> {
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["variants.id"],
    filters: {
      id: productId,
    },
  });

  const variantIds = uniqueStrings(
    ((products[0]?.variants as Array<{ id?: string }> | undefined) ?? [])
      .map((variant) => asString(variant.id))
      .filter((value): value is string => Boolean(value))
  );

  if (!variantIds.length) {
    return;
  }

  const { data: variantInventoryItems } = await query.graph({
    entity: "product_variant_inventory_items",
    fields: ["inventory_item_id", "variant_id"],
    filters: {
      variant_id: variantIds,
    },
  });

  const inventoryItemIds = uniqueStrings(
    variantInventoryItems
      .map((entry) => asString(entry.inventory_item_id))
      .filter((value): value is string => Boolean(value))
  );

  if (!inventoryItemIds.length) {
    return;
  }

  const { data: existingLevels } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id"],
    filters: {
      inventory_item_id: inventoryItemIds,
      location_id: stockLocationId,
    },
  });

  const existingInventoryItemIds = new Set(
    existingLevels
      .map((entry) => asString(entry.inventory_item_id))
      .filter((value): value is string => Boolean(value))
  );

  const missingInventoryLevels = inventoryItemIds
    .filter((inventoryItemId) => !existingInventoryItemIds.has(inventoryItemId))
    .map((inventoryItemId) => ({
      inventory_item_id: inventoryItemId,
      location_id: stockLocationId,
      stocked_quantity: 1000,
    }));

  if (!missingInventoryLevels.length) {
    return;
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: missingInventoryLevels,
    },
  });
}

async function ensureCategories(
  container: MedusaContainer,
  query: {
    graph: (input: Record<string, unknown>) => Promise<{ data?: any[] }>;
  },
  categories: NormalizedCategoryInput[]
): Promise<
  Array<{
    record: CategoryRecord;
    action: SiteBuilderAction;
    parent?: string;
  }>
> {
  const resolved = new Map<
    string,
    {
      record: CategoryRecord;
      action: SiteBuilderAction;
      parent?: string;
    }
  >();

  for (const category of categories) {
    const existing = await findCategory(query, category.handle, category.name);

    if (existing) {
      resolved.set(category.handle, {
        record: existing,
        action: "reused",
        parent: category.parent,
      });
    }
  }

  const pending = categories.filter((category) => !resolved.has(category.handle));

  while (pending.length) {
    let progressed = false;

    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const category = pending[i];

      if (category.parent && !resolved.has(category.parent)) {
        continue;
      }

      const { result } = await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: [
            {
              name: category.name,
              handle: category.handle,
              description: category.description,
              is_active: category.is_active,
              is_internal: category.is_internal,
              parent_category_id: category.parent
                ? resolved.get(category.parent)?.record.id
                : undefined,
              metadata: category.metadata,
            },
          ],
        },
      });

      const created = result[0];

      resolved.set(category.handle, {
        record: {
          id: created.id,
          name: created.name,
          handle: created.handle ?? category.handle,
        },
        action: "created",
        parent: category.parent,
      });
      pending.splice(i, 1);
      progressed = true;
    }

    if (!progressed) {
      throw new Error(
        `Unable to resolve category parents: ${pending
          .map((category) => category.name)
          .join(", ")}`
      );
    }
  }

  return categories
    .map((category) => resolved.get(category.handle))
    .filter(Boolean) as Array<{
    record: CategoryRecord;
    action: SiteBuilderAction;
    parent?: string;
  }>;
}

async function findCategory(
  query: {
    graph: (input: Record<string, unknown>) => Promise<{ data?: any[] }>;
  },
  handle: string,
  name: string
): Promise<CategoryRecord | null> {
  const byHandle = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle"],
    filters: {
      handle,
    },
  });

  if (byHandle.data?.[0]) {
    return byHandle.data[0];
  }

  const byName = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle"],
    filters: {
      name,
    },
  });

  return (byName.data?.[0] as CategoryRecord | undefined) ?? null;
}

async function findProductByHandle(
  query: {
    graph: (input: Record<string, unknown>) => Promise<{ data?: any[] }>;
  },
  handle: string
): Promise<ProductRecord | null> {
  const result = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "status"],
    filters: {
      handle,
    },
  });

  return (result.data?.[0] as ProductRecord | undefined) ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNullableString(value: unknown): string | null {
  return value === null ? null : asString(value);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function asIntegrationStatus(
  value: unknown
): SitePlatformIntegration["status"] | null {
  return value === "not_configured" ||
    value === "configuring" ||
    value === "ready" ||
    value === "failed"
    ? value
    : null;
}
