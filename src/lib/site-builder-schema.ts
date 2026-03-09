import { ProductStatus } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

const moneyAmountSchema = z
  .object({
    amount: z.number().int().nonnegative(),
    currency_code: z.string().trim().min(3).max(3),
    min_quantity: z.number().int().positive().optional(),
    max_quantity: z.number().int().positive().optional(),
  })
  .strict();

const imageSchema = z.union([
  z.string().url(),
  z
    .object({
      url: z.string().url(),
    })
    .strict(),
]);

const categorySchema = z.union([
  z.string().trim().min(1),
  z
    .object({
      name: z.string().trim().min(1),
      handle: z.string().trim().min(1).optional(),
      description: z.string().trim().min(1).optional(),
      is_active: z.boolean().optional(),
      is_internal: z.boolean().optional(),
      parent: z.string().trim().min(1).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .strict(),
]);

const productOptionSchema = z
  .object({
    title: z.string().trim().min(1),
    values: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const productVariantSchema = z
  .object({
    title: z.string().trim().min(1),
    sku: z.string().trim().min(1).optional(),
    prices: z.array(moneyAmountSchema).min(1),
    options: z.record(z.string().trim().min(1)).optional(),
    manage_inventory: z.boolean().optional(),
    allow_backorder: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
    weight: z.number().nonnegative().optional(),
    length: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    width: z.number().nonnegative().optional(),
  })
  .strict();

const productSchema = z
  .object({
    title: z.string().trim().min(1),
    handle: z.string().trim().min(1).optional(),
    subtitle: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    thumbnail: z.string().url().optional(),
    images: z.array(imageSchema).optional(),
    categories: z.array(z.string().trim().min(1)).optional(),
    options: z.array(productOptionSchema).optional(),
    variants: z.array(productVariantSchema).optional(),
    prices: z.array(moneyAmountSchema).optional(),
    status: z.nativeEnum(ProductStatus).optional(),
    metadata: z.record(z.unknown()).optional(),
    discountable: z.boolean().optional(),
    is_giftcard: z.boolean().optional(),
    weight: z.number().nonnegative().optional(),
    length: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    width: z.number().nonnegative().optional(),
    material: z.string().trim().min(1).optional(),
    origin_country: z.string().trim().min(2).max(2).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.variants?.length && !value.prices?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each product needs variants or top-level prices.",
        path: ["variants"],
      });
    }

    if (value.variants?.length && value.prices?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use product.prices only when variants are omitted.",
        path: ["prices"],
      });
    }
  });

const sitePageSchema = z
  .object({
    slug: z.string().trim().min(1),
    title: z.string().trim().min(1),
    prompt: z.string().trim().min(1).optional(),
  })
  .strict();

const domainStatusSchema = z.enum([
  "unconfigured",
  "pending",
  "verified",
  "failed",
]);

const sslStatusSchema = z.enum([
  "unconfigured",
  "pending",
  "issued",
  "failed",
]);

const deploymentStatusSchema = z.enum([
  "not_started",
  "queued",
  "building",
  "ready",
  "failed",
]);

const paymentStatusSchema = z.enum([
  "not_configured",
  "configuring",
  "ready",
  "failed",
]);

const webhookStatusSchema = z.enum([
  "not_configured",
  "pending",
  "ready",
  "failed",
]);

const integrationStatusSchema = z.enum([
  "not_configured",
  "configuring",
  "ready",
  "failed",
]);

const sitePlatformIntegrationSchema = z
  .object({
    status: integrationStatusSchema.optional(),
    provider: z.string().trim().min(1).optional(),
    external_id: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const sitePlatformDomainSchema = z
  .object({
    hostname: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    dns_status: domainStatusSchema.optional(),
    ssl_status: sslStatusSchema.optional(),
    connected_at: z.string().datetime().optional(),
    notes: z.string().trim().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const sitePlatformDeploymentSchema = z
  .object({
    provider: z.string().trim().min(1).optional(),
    project_id: z.string().trim().min(1).optional(),
    environment: z.string().trim().min(1).optional(),
    status: deploymentStatusSchema.optional(),
    url: z.string().url().optional(),
    preview_url: z.string().url().optional(),
    last_deployed_at: z.string().datetime().optional(),
    notes: z.string().trim().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const sitePlatformPaymentsSchema = z
  .object({
    provider: z.string().trim().min(1).optional(),
    mode: z.enum(["test", "live"]).optional(),
    status: paymentStatusSchema.optional(),
    account_id: z.string().trim().min(1).optional(),
    publishable_key: z.string().trim().min(1).optional(),
    webhook_url: z.string().url().optional(),
    webhook_status: webhookStatusSchema.optional(),
    notes: z.string().trim().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const sitePlatformOperationsSchema = z
  .object({
    seo: sitePlatformIntegrationSchema.optional(),
    analytics: sitePlatformIntegrationSchema.optional(),
    email_marketing: sitePlatformIntegrationSchema.optional(),
    ads: sitePlatformIntegrationSchema.optional(),
    crm: sitePlatformIntegrationSchema.optional(),
    automation: sitePlatformIntegrationSchema.optional(),
    notes: z.string().trim().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const sitePlatformSchema = z
  .object({
    domain: sitePlatformDomainSchema.optional(),
    deployment: sitePlatformDeploymentSchema.optional(),
    payments: sitePlatformPaymentsSchema.optional(),
    operations: sitePlatformOperationsSchema.optional(),
  })
  .strict();

const siteSchema = z
  .object({
    name: z.string().trim().min(1),
    slug: z.string().trim().min(1).optional(),
    domain: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    backend_url: z.string().url().optional(),
    design_brief: z.string().trim().min(1).optional(),
    theme: z.record(z.unknown()).optional(),
    pages: z.array(sitePageSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const defaultsSchema = z
  .object({
    currency_code: z.string().trim().min(3).max(3).default("usd"),
    status: z.nativeEnum(ProductStatus).default(ProductStatus.PUBLISHED),
    shipping_profile_id: z.string().trim().min(1).optional(),
  })
  .strict()
  .default({
    currency_code: "usd",
    status: ProductStatus.PUBLISHED,
  });

const optionsSchema = z
  .object({
    reuse_sales_channel: z.boolean().default(true),
    skip_existing_products: z.boolean().default(true),
    create_publishable_key: z.boolean().default(true),
  })
  .strict()
  .default({
    reuse_sales_channel: true,
    skip_existing_products: true,
    create_publishable_key: true,
  });

export const siteBuilderInputSchema = z
  .object({
    site: siteSchema,
    categories: z.array(categorySchema).default([]),
    products: z.array(productSchema).default([]),
    platform: sitePlatformSchema.default({}),
    defaults: defaultsSchema,
    options: optionsSchema,
  })
  .strict();

export const siteDeployInputSchema = z
  .object({
    provider: z.literal("dokploy").default("dokploy"),
    target: z
      .object({
        base_url: z.string().url().optional(),
        api_key: z.string().trim().min(1).optional(),
        project_id: z.string().trim().min(1).optional(),
        environment_id: z.string().trim().min(1).optional(),
        application_id: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1).optional(),
        app_name: z.string().trim().min(1).optional(),
        description: z.string().trim().min(1).optional(),
        owner: z.string().trim().min(1),
        repository: z.string().trim().min(1),
        branch: z.string().trim().min(1).default("main"),
        build_type: z.enum(["dockerfile", "nixpacks"]).default("dockerfile"),
        dockerfile: z.string().trim().min(1).optional(),
        preview_port: z.number().int().positive().default(3000),
        env: z.record(z.string()).default({}),
        url: z.string().url().optional(),
        auto_deploy: z.boolean().default(true),
      })
      .strict(),
  })
  .strict();

export const siteControlPlanePatchSchema = z
  .object({
    site: z
      .object({
        name: z.string().trim().min(1).optional(),
        domain: z.string().trim().min(1).nullable().optional(),
        description: z.string().trim().min(1).nullable().optional(),
        backend_url: z.string().url().nullable().optional(),
        design_brief: z.string().trim().min(1).nullable().optional(),
        theme: z.record(z.unknown()).optional(),
        pages: z.array(sitePageSchema).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .strict()
      .optional(),
    platform: z
      .object({
        domain: sitePlatformDomainSchema.partial().optional(),
        deployment: sitePlatformDeploymentSchema.partial().optional(),
        payments: sitePlatformPaymentsSchema.partial().optional(),
        operations: sitePlatformOperationsSchema.partial().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SiteBuilderInput = z.infer<typeof siteBuilderInputSchema>;
export type SiteBuilderCategoryInput = z.infer<typeof categorySchema>;
export type SiteBuilderProductInput = z.infer<typeof productSchema>;
export type SiteBuilderProductVariantInput = z.infer<typeof productVariantSchema>;
export type SitePlatformInput = z.infer<typeof sitePlatformSchema>;
export type SiteControlPlanePatchInput = z.infer<
  typeof siteControlPlanePatchSchema
>;
export type SiteDeployInput = z.infer<typeof siteDeployInputSchema>;

export const siteBuilderExampleInput: SiteBuilderInput = {
  site: {
    name: "Acme Outdoors",
    slug: "acme-outdoors",
    domain: "shop.acmeoutdoors.com",
    design_brief:
      "Premium outdoor gear brand. Clean editorial layout, warm neutrals, strong product storytelling.",
    theme: {
      primary_color: "#244033",
      accent_color: "#d6a85f",
      font_family: "Fraunces + Instrument Sans",
    },
    pages: [
      {
        slug: "/",
        title: "Home",
        prompt:
          "Create a conversion-focused homepage with hero, category grid, featured products, reviews, and FAQ.",
      },
      {
        slug: "/products/[handle]",
        title: "Product Detail",
        prompt:
          "Create a premium PDP with sticky purchase card, gallery, specs, shipping, and recommendation blocks.",
      },
    ],
  },
  platform: {
    domain: {
      hostname: "shop.acmeoutdoors.com",
      provider: "cloudflare",
      dns_status: "pending",
      ssl_status: "unconfigured",
    },
    deployment: {
      provider: "dokploy",
      environment: "production",
      status: "queued",
    },
    payments: {
      provider: "stripe",
      mode: "test",
      status: "configuring",
      webhook_status: "pending",
    },
    operations: {
      analytics: {
        status: "not_configured",
      },
      seo: {
        status: "configuring",
      },
    },
  },
  categories: ["Backpacks", "Camp Kitchen", "Trail Accessories"],
  products: [
    {
      title: "Summit Daypack",
      handle: "summit-daypack",
      description: "Lightweight daypack for hikes and city travel.",
      categories: ["Backpacks"],
      options: [
        {
          title: "Color",
          values: ["Forest", "Sand"],
        },
      ],
      variants: [
        {
          title: "Forest",
          sku: "ACME-DAYPACK-FOREST",
          options: {
            Color: "Forest",
          },
          prices: [
            {
              amount: 12900,
              currency_code: "usd",
            },
          ],
        },
        {
          title: "Sand",
          sku: "ACME-DAYPACK-SAND",
          options: {
            Color: "Sand",
          },
          prices: [
            {
              amount: 12900,
              currency_code: "usd",
            },
          ],
        },
      ],
    },
  ],
  defaults: {
    currency_code: "usd",
    status: ProductStatus.PUBLISHED,
  },
  options: {
    reuse_sales_channel: true,
    skip_existing_products: true,
    create_publishable_key: true,
  },
};

export const siteControlPlanePatchExampleInput: SiteControlPlanePatchInput = {
  platform: {
    domain: {
      dns_status: "verified",
      ssl_status: "issued",
      connected_at: "2026-03-09T12:00:00.000Z",
    },
    deployment: {
      status: "ready",
      url: "https://shop.acmeoutdoors.com",
      last_deployed_at: "2026-03-09T12:05:00.000Z",
    },
    payments: {
      status: "ready",
      webhook_status: "ready",
    },
  },
};

export const siteDeployExampleInput: SiteDeployInput = {
  provider: "dokploy",
  target: {
    owner: "Tony11081",
    repository: "medusa-storefront",
    branch: "main",
    build_type: "dockerfile",
    dockerfile: "Dockerfile",
    preview_port: 3000,
    auto_deploy: true,
    env: {
      MEDUSA_BACKEND_URL:
        "http://medusa-store-ga7di9-4e3642-23-94-38-181.traefik.me",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_xxx",
    },
  },
};
