import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { SiteBuilderCategoryInput, SiteBuilderInput, SiteBuilderProductInput, SiteBuilderProductVariantInput } from "./site-builder-schema";

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
};

export type SiteBuilderManifest = {
  version: number;
  site: {
    name: string;
    slug: string;
    domain: string | null;
    backend_url: string | null;
    design_brief: string | null;
    theme: Record<string, unknown>;
    pages: Array<{
      slug: string;
      title: string;
      prompt?: string;
    }>;
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
  storefront_env: {
    MEDUSA_BACKEND_URL: string | null;
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: string | null;
    SITE_SLUG: string;
  };
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
    };
    next_steps: string[];
  };
};

type BuildSiteManifestOptions = {
  backendUrl?: string | null;
  createdBy?: string;
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
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);

  const siteSlug = slugify(input.site.slug ?? input.site.name);
  const salesChannelName = `${input.site.name} (${siteSlug})`;
  const backendUrl =
    options.backendUrl ??
    input.site.backend_url ??
    process.env.SITE_BUILDER_BACKEND_URL ??
    process.env.MEDUSA_BACKEND_URL ??
    null;

  logger.info(`Building site manifest for ${siteSlug}`);

  let salesChannelAction: SiteBuilderAction = "created";
  let salesChannel: SalesChannelRecord | null = null;

  if (input.options.reuse_sales_channel) {
    const existingChannels = await salesChannelModuleService.listSalesChannels({
      name: salesChannelName,
    });
    const existingChannel = existingChannels[0];
    salesChannel = existingChannel
      ? {
          id: existingChannel.id,
          name: existingChannel.name,
        }
      : null;
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
    };
  } else {
    salesChannelAction = "reused";
  }

  if (!salesChannel) {
    throw new Error("Failed to resolve sales channel.");
  }

  let publishableApiKey: SiteBuilderManifest["publishable_api_key"] = null;

  if (input.options.create_publishable_key) {
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
    const product = normalizeProduct(rawProduct, input.defaults.currency_code, input.defaults.status);
    const existingProduct =
      input.options.skip_existing_products
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
  }

  return {
    version: 1,
    site: {
      name: input.site.name,
      slug: siteSlug,
      domain: input.site.domain ?? null,
      backend_url: backendUrl,
      design_brief: input.site.design_brief ?? null,
      theme: input.site.theme ?? {},
      pages: input.site.pages ?? [],
    },
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
    storefront_env: {
      MEDUSA_BACKEND_URL: backendUrl,
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: publishableApiKey?.token ?? null,
      SITE_SLUG: siteSlug,
    },
    ai_handoff: {
      design_tool_input: {
        site_name: input.site.name,
        domain: input.site.domain ?? null,
        design_brief: input.site.design_brief ?? null,
        theme: input.site.theme ?? {},
        pages: input.site.pages ?? [],
      },
      next_steps: [
        "Use ai_handoff.design_tool_input in the UI generator.",
        "Apply storefront_env values to the frontend deployment.",
        "Bind the generated frontend to the returned sales channel catalog.",
      ],
    },
  };
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
    listShippingProfiles: (filters: Record<string, unknown>) => Promise<Array<{ id: string }>>;
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
