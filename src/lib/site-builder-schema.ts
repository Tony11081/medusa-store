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
    defaults: defaultsSchema,
    options: optionsSchema,
  })
  .strict();

export type SiteBuilderInput = z.infer<typeof siteBuilderInputSchema>;
export type SiteBuilderCategoryInput = z.infer<typeof categorySchema>;
export type SiteBuilderProductInput = z.infer<typeof productSchema>;
export type SiteBuilderProductVariantInput = z.infer<typeof productVariantSchema>;

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
