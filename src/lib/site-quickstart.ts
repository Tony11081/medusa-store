import { MedusaContainer } from "@medusajs/framework/types";
import { ProductStatus } from "@medusajs/framework/utils";
import { buildSiteManifest, SiteBuilderManifest } from "./site-builder";
import {
  SiteBuilderCategoryInput,
  SiteBuilderInput,
  SiteBuilderProductInput,
  SiteQuickstartInput,
  siteBuilderInputSchema,
} from "./site-builder-schema";

const QUICKSTART_PARSER_VERSION = 1;
const FALLBACK_PRICE_AMOUNT = 1000;

type BuildSiteFromQuickstartOptions = {
  backendUrl?: string | null;
  createdBy?: string;
};

type QuickstartDocumentFormat = "text" | "markdown" | "json" | "structured";

type NormalizedQuickstartDocument = {
  title: string | null;
  format: QuickstartDocumentFormat;
  content: string | null;
  categories: SiteBuilderCategoryInput[];
  products: SiteBuilderProductInput[];
  metadata: Record<string, unknown>;
};

type ParsedCatalog = {
  categories: SiteBuilderCategoryInput[];
  products: SiteBuilderProductInput[];
  warnings: string[];
};

export type SiteQuickstartResult = {
  version: number;
  route: "/admin/site-builder/quickstart";
  privilege: "full-admin";
  intake: {
    parser_version: number;
    brand_name: string;
    website_intro: string;
    domain: string | null;
    product_document: {
      title: string | null;
      format: QuickstartDocumentFormat;
      excerpt: string | null;
    };
    inferred_site: {
      slug: string;
      theme: Record<string, unknown>;
      page_slugs: string[];
    };
    inferred_catalog: {
      category_count: number;
      product_count: number;
      category_handles: string[];
      product_handles: string[];
    };
    warnings: string[];
  };
  normalized_input: SiteBuilderInput;
  manifest: SiteBuilderManifest;
};

export async function buildSiteFromQuickstart(
  container: MedusaContainer,
  input: SiteQuickstartInput,
  options: BuildSiteFromQuickstartOptions = {}
): Promise<SiteQuickstartResult> {
  const synthesized = synthesizeSiteBuilderInputFromQuickstart(input);
  const manifest = await buildSiteManifest(container, synthesized.normalized_input, {
    backendUrl: options.backendUrl,
    createdBy: options.createdBy,
  });

  return {
    version: 1,
    route: "/admin/site-builder/quickstart",
    privilege: "full-admin",
    intake: synthesized.intake,
    normalized_input: synthesized.normalized_input,
    manifest,
  };
}

export function synthesizeSiteBuilderInputFromQuickstart(
  input: SiteQuickstartInput
): Pick<SiteQuickstartResult, "intake" | "normalized_input"> {
  const document = normalizeQuickstartDocument(input.product_document);
  const catalog = extractCatalogFromDocument(
    document,
    input.defaults.currency_code
  );
  const siteSlug = slugify(input.site?.slug ?? input.brand_name);
  const theme = {
    ...deriveTheme(input.brand_name, input.website_intro),
    ...(input.site?.theme ?? {}),
  };
  const pages =
    input.site?.pages ??
    buildDefaultPages(input.brand_name, input.website_intro, catalog.products);
  const primaryCategory =
    firstCategoryName(catalog.categories) ?? "Catalog";
  const designBrief = buildDesignBrief(
    input.brand_name,
    input.website_intro,
    primaryCategory,
    catalog.products
  );
  const normalizedInput = siteBuilderInputSchema.parse({
    site: {
      name: input.brand_name,
      slug: siteSlug,
      domain: input.domain,
      description: input.website_intro,
      backend_url: input.site?.backend_url,
      design_brief: designBrief,
      theme,
      pages,
      metadata: {
        ...(input.site?.metadata ?? {}),
        ai_quickstart: {
          parser_version: QUICKSTART_PARSER_VERSION,
          brand_name: input.brand_name,
          website_intro: input.website_intro,
          source_document_title: document.title,
          source_document_format: document.format,
          source_document_excerpt: excerpt(document.content, 360),
          source_document_metadata: document.metadata,
          warnings: catalog.warnings,
        },
      },
    },
    categories: catalog.categories,
    products: catalog.products,
    platform: input.platform,
    defaults: input.defaults,
    options: input.options,
  });

  return {
    intake: {
      parser_version: QUICKSTART_PARSER_VERSION,
      brand_name: input.brand_name,
      website_intro: input.website_intro,
      domain: input.domain ?? null,
      product_document: {
        title: document.title,
        format: document.format,
        excerpt: excerpt(document.content, 360),
      },
      inferred_site: {
        slug: siteSlug,
        theme,
        page_slugs: pages.map((page) => page.slug),
      },
      inferred_catalog: {
        category_count: catalog.categories.length,
        product_count: catalog.products.length,
        category_handles: catalog.categories.map((category) =>
          typeof category === "string"
            ? slugify(category)
            : slugify(category.handle ?? category.name)
        ),
        product_handles: catalog.products.map((product) =>
          slugify(product.handle ?? product.title)
        ),
      },
      warnings: catalog.warnings,
    },
    normalized_input: normalizedInput,
  };
}

function normalizeQuickstartDocument(
  input: SiteQuickstartInput["product_document"]
): NormalizedQuickstartDocument {
  if (typeof input === "string") {
    return {
      title: null,
      format: inferDocumentFormat(input),
      content: input,
      categories: [],
      products: [],
      metadata: {},
    };
  }

  return {
    title: input.title ?? null,
    format:
      input.format ??
      (input.products?.length || input.categories?.length
        ? "structured"
        : inferDocumentFormat(input.content ?? "")),
    content: input.content ?? null,
    categories: input.categories ?? [],
    products: input.products ?? [],
    metadata: input.metadata ?? {},
  };
}

function extractCatalogFromDocument(
  document: NormalizedQuickstartDocument,
  defaultCurrencyCode: string
): ParsedCatalog {
  const warnings: string[] = [];
  const categoryMap = new Map<string, SiteBuilderCategoryInput>();
  const productMap = new Map<string, SiteBuilderProductInput>();

  for (const category of document.categories) {
    categoryMap.set(categoryHandle(category), category);
  }

  for (const product of document.products) {
    productMap.set(slugify(product.handle ?? product.title), product);
  }

  if (document.content) {
    const parsed =
      document.format === "json"
        ? parseJsonDocument(document.content, defaultCurrencyCode)
        : parseTextDocument(document.content, defaultCurrencyCode);

    for (const warning of parsed.warnings) {
      warnings.push(warning);
    }

    for (const category of parsed.categories) {
      const handle = categoryHandle(category);
      if (!categoryMap.has(handle)) {
        categoryMap.set(handle, category);
      }
    }

    for (const product of parsed.products) {
      const handle = slugify(product.handle ?? product.title);
      if (!productMap.has(handle)) {
        productMap.set(handle, product);
      }
    }
  }

  const products = Array.from(productMap.values()).map((product) =>
    finalizeProductCandidate(product, defaultCurrencyCode, warnings)
  );

  for (const product of products) {
    for (const category of product.categories ?? ["Catalog"]) {
      const handle = slugify(category);
      if (!categoryMap.has(handle)) {
        categoryMap.set(handle, category);
      }
    }
  }

  if (!products.length) {
    throw new Error(
      "No products could be inferred from product_document. Provide structured products or include product titles in the document."
    );
  }

  return {
    categories: Array.from(categoryMap.values()),
    products,
    warnings: dedupe(warnings),
  };
}

function parseJsonDocument(
  content: string,
  defaultCurrencyCode: string
): ParsedCatalog {
  try {
    const parsed = JSON.parse(content) as unknown;
    return extractStructuredCatalog(parsed, defaultCurrencyCode);
  } catch (error) {
    const fallback = parseTextDocument(content, defaultCurrencyCode);

    return {
      ...fallback,
      warnings: [
        `product_document declared as JSON but could not be parsed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
        ...fallback.warnings,
      ],
    };
  }
}

function extractStructuredCatalog(
  input: unknown,
  defaultCurrencyCode: string
): ParsedCatalog {
  const warnings: string[] = [];
  const record = asRecord(input);
  const categories: SiteBuilderCategoryInput[] = [];
  const products: SiteBuilderProductInput[] = [];

  const categoryCandidates = Array.isArray(record?.categories)
    ? record.categories
    : [];
  for (const category of categoryCandidates) {
    const normalized = normalizeCategoryCandidate(category);
    if (normalized) {
      categories.push(normalized);
    }
  }

  const productCandidates = resolveProductCandidates(input);
  for (const candidate of productCandidates) {
    const normalized = normalizeProductCandidate(candidate, defaultCurrencyCode);
    if (normalized.product) {
      products.push(normalized.product);
    } else if (normalized.reason) {
      warnings.push(normalized.reason);
    }
  }

  return { categories, products, warnings };
}

function resolveProductCandidates(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }

  const record = asRecord(input);
  if (!record) {
    return [];
  }

  const nestedCatalog = asRecord(record.catalog);
  const candidates =
    asArray(record.products) ??
    asArray(record.items) ??
    asArray(nestedCatalog?.products) ??
    asArray(nestedCatalog?.items);

  if (candidates?.length) {
    return candidates;
  }

  return looksLikeProductRecord(record) ? [record] : [];
}

function parseTextDocument(
  content: string,
  defaultCurrencyCode: string
): ParsedCatalog {
  const warnings: string[] = [];
  const products: SiteBuilderProductInput[] = [];
  const blocks = splitProductBlocks(content);

  for (const block of blocks) {
    const parsed = parseTextProductBlock(block, defaultCurrencyCode);
    for (const warning of parsed.warnings) {
      warnings.push(warning);
    }

    if (parsed.product) {
      products.push(parsed.product);
    }
  }

  return {
    categories: collectCategories(products),
    products,
    warnings,
  };
}

function splitProductBlocks(content: string): string[] {
  const normalized = content.replace(/\r/g, "").trim();

  if (!normalized) {
    return [];
  }

  const headingBlocks = normalized
    .split(/\n(?=#{1,3}\s+)/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (headingBlocks.length > 1) {
    return headingBlocks;
  }

  const paragraphBlocks = normalized
    .split(/\n\s*\n+/g)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphBlocks.length > 1) {
    return paragraphBlocks;
  }

  const bulletLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return bulletLines.length > 1 ? bulletLines : [normalized];
}

function parseTextProductBlock(
  block: string,
  defaultCurrencyCode: string
): { product: SiteBuilderProductInput | null; warnings: string[] } {
  const warnings: string[] = [];
  const rawLines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = rawLines.map(stripMarkdownDecorators);

  if (!lines.length) {
    return { product: null, warnings };
  }

  const categoryLine = findLineValue(lines, ["category", "categories", "collection"]);
  const priceLine = findLineValue(lines, ["price", "retail price", "starting price"]);
  const imageLine = findLineValue(lines, ["image", "thumbnail"]);
  const materialLine = findLineValue(lines, ["material"]);
  const originLine = findLineValue(lines, ["origin", "origin country"]);
  const hasSignal =
    Boolean(priceLine) ||
    Boolean(categoryLine) ||
    Boolean(imageLine) ||
    /^#{1,3}\s+/.test(rawLines[0]) ||
    /^(product|title|name)\s*:/i.test(lines[0]) ||
    /[$€£]|\b(?:usd|eur|gbp|aud|cad|cny|rmb)\b/i.test(block);

  if (!hasSignal) {
    return { product: null, warnings };
  }

  const title =
    findLineValue(lines, ["product", "title", "name"]) ??
    stripMarkdownDecorators(rawLines[0]).replace(/^(product|title|name)\s*:\s*/i, "");

  if (!title) {
    return { product: null, warnings: ["Skipped a product block without a title."] };
  }

  const parsedPrice = parseMoneyText(priceLine ?? block, defaultCurrencyCode);
  const categories = normalizeCategoryNames(categoryLine);
  const imageUrl = extractImageUrl(imageLine ?? block);
  const description = buildDescriptionFromLines(lines, {
    title,
    consumedValues: [categoryLine, priceLine, imageLine, materialLine, originLine],
  });

  const product = finalizeProductCandidate(
    {
      title,
      description: description || undefined,
      categories: categories.length ? categories : undefined,
      prices: parsedPrice ? [parsedPrice] : undefined,
      thumbnail: imageUrl ?? undefined,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
      material: materialLine ?? undefined,
      origin_country: normalizeCountryCode(originLine),
      metadata: {
        ai_quickstart_source: "text_document",
      },
    },
    defaultCurrencyCode,
    warnings
  );

  if (!parsedPrice) {
    warnings.push(
      `No price found for "${title}". Applied fallback price ${formatFallbackPrice(
        defaultCurrencyCode
      )}.`
    );
  }

  if (!categories.length) {
    warnings.push(`No category found for "${title}". Assigned it to Catalog.`);
  }

  return { product, warnings };
}

function finalizeProductCandidate(
  product: SiteBuilderProductInput,
  defaultCurrencyCode: string,
  warnings: string[]
): SiteBuilderProductInput {
  const categories = product.categories?.length ? product.categories : ["Catalog"];
  const prices =
    product.prices?.length || product.variants?.length
      ? product.prices
      : [fallbackPrice(defaultCurrencyCode)];

  if (!product.prices?.length && !product.variants?.length) {
    const title = product.title ?? "Untitled product";
    warnings.push(
      `No price found for "${title}". Applied fallback price ${formatFallbackPrice(
        defaultCurrencyCode
      )}.`
    );
  }

  return {
    ...product,
    handle: product.handle ?? slugify(product.title),
    description: product.description ?? product.subtitle ?? `Buy ${product.title}.`,
    categories,
    prices,
    status: product.status ?? ProductStatus.PUBLISHED,
    metadata: {
      ...(product.metadata ?? {}),
      ai_quickstart: {
        fallback_price_applied:
          !product.prices?.length && !product.variants?.length,
      },
    },
  };
}

function normalizeProductCandidate(
  candidate: unknown,
  defaultCurrencyCode: string
): { product: SiteBuilderProductInput | null; reason?: string } {
  const record = asRecord(candidate);

  if (!record) {
    return { product: null, reason: "Skipped a malformed product record." };
  }

  const title =
    asString(record.title) ??
    asString(record.name) ??
    asString(record.product_name);

  if (!title) {
    return {
      product: null,
      reason: "Skipped a structured product without title/name.",
    };
  }

  const categoryNames = normalizeCategoryNames(
    record.categories ?? record.category ?? record.collection ?? record.type
  );
  const imageUrls = normalizeImageUrls(
    record.images ?? record.image ?? record.thumbnail
  );
  const prices = normalizeMoneyInputs(
    record.prices ?? record.price ?? record.amount,
    defaultCurrencyCode,
    asString(record.currency_code) ?? undefined
  );
  const variants = normalizeVariantInputs(record.variants, defaultCurrencyCode);

  return {
    product: {
      title,
      handle: asString(record.handle) ?? asString(record.slug) ?? undefined,
      subtitle: asString(record.subtitle) ?? undefined,
      description:
        asString(record.description) ??
        asString(record.summary) ??
        undefined,
      thumbnail: imageUrls[0],
      images: imageUrls.map((url) => ({ url })),
      categories: categoryNames.length ? categoryNames : undefined,
      prices: variants.length ? undefined : prices,
      variants: variants.length ? variants : undefined,
      status:
        normalizeStatus(asString(record.status)) ?? ProductStatus.PUBLISHED,
      metadata: asRecord(record.metadata) ?? undefined,
      discountable:
        typeof record.discountable === "boolean" ? record.discountable : undefined,
      is_giftcard:
        typeof record.is_giftcard === "boolean" ? record.is_giftcard : undefined,
      material: asString(record.material) ?? undefined,
      origin_country: normalizeCountryCode(record.origin_country),
    },
  };
}

function normalizeVariantInputs(
  input: unknown,
  defaultCurrencyCode: string
): NonNullable<SiteBuilderProductInput["variants"]> {
  const values = asArray(input) ?? [];

  return values
    .map((value) => {
      const record = asRecord(value);

      if (!record) {
        return null;
      }

      const title =
        asString(record.title) ??
        asString(record.name) ??
        asString(record.sku);

      if (!title) {
        return null;
      }

      const prices = normalizeMoneyInputs(
        record.prices ?? record.price ?? record.amount,
        defaultCurrencyCode,
        asString(record.currency_code) ?? undefined
      );

      return {
        title,
        sku: asString(record.sku) ?? undefined,
        prices: prices.length ? prices : [fallbackPrice(defaultCurrencyCode)],
        options: normalizeVariantOptions(record.options, title),
        manage_inventory:
          typeof record.manage_inventory === "boolean"
            ? record.manage_inventory
            : undefined,
        allow_backorder:
          typeof record.allow_backorder === "boolean"
            ? record.allow_backorder
            : undefined,
        metadata: asRecord(record.metadata) ?? undefined,
      };
    })
    .filter(Boolean) as NonNullable<SiteBuilderProductInput["variants"]>;
}

function normalizeVariantOptions(
  input: unknown,
  fallbackTitle: string
): Record<string, string> {
  const record = asRecord(input);

  if (record) {
    return Object.entries(record).reduce<Record<string, string>>(
      (accumulator, [key, value]) => {
        const normalized = asString(value);
        if (normalized) {
          accumulator[key] = normalized;
        }
        return accumulator;
      },
      {}
    );
  }

  return {
    Title: fallbackTitle,
  };
}

function normalizeMoneyInputs(
  input: unknown,
  defaultCurrencyCode: string,
  explicitCurrencyCode?: string
): Array<{ amount: number; currency_code: string }> {
  if (Array.isArray(input)) {
    return input
      .map((value) =>
        normalizeSingleMoney(value, defaultCurrencyCode, explicitCurrencyCode)
      )
      .filter(Boolean) as Array<{ amount: number; currency_code: string }>;
  }

  const normalized = normalizeSingleMoney(
    input,
    defaultCurrencyCode,
    explicitCurrencyCode
  );

  return normalized ? [normalized] : [];
}

function normalizeSingleMoney(
  input: unknown,
  defaultCurrencyCode: string,
  explicitCurrencyCode?: string
): { amount: number; currency_code: string } | null {
  const record = asRecord(input);

  if (
    record &&
    typeof record.amount === "number" &&
    Number.isFinite(record.amount)
  ) {
    return {
      amount: Math.round(record.amount),
      currency_code: (
        asString(record.currency_code) ??
        explicitCurrencyCode ??
        defaultCurrencyCode
      ).toLowerCase(),
    };
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    return {
      amount: Math.round(input),
      currency_code: (explicitCurrencyCode ?? defaultCurrencyCode).toLowerCase(),
    };
  }

  const parsed = parseMoneyText(asString(input), defaultCurrencyCode);
  return parsed;
}

function parseMoneyText(
  input: string | null | undefined,
  defaultCurrencyCode: string
): { amount: number; currency_code: string } | null {
  if (!input) {
    return null;
  }

  const text = input.trim();
  const matchers: Array<{
    regex: RegExp;
    currency?: string;
    valueIndex: number;
    currencyIndex?: number;
  }> = [
    { regex: /\$ ?(\d[\d,]*(?:\.\d{1,2})?)/i, currency: "usd", valueIndex: 1 },
    { regex: /€ ?(\d[\d,]*(?:\.\d{1,2})?)/i, currency: "eur", valueIndex: 1 },
    { regex: /£ ?(\d[\d,]*(?:\.\d{1,2})?)/i, currency: "gbp", valueIndex: 1 },
    {
      regex:
        /\b(usd|eur|gbp|aud|cad|cny|rmb)\b[^0-9]*(\d[\d,]*(?:\.\d{1,2})?)/i,
      valueIndex: 2,
      currencyIndex: 1,
    },
    {
      regex:
        /(\d[\d,]*(?:\.\d{1,2})?)[^a-z0-9]*(usd|eur|gbp|aud|cad|cny|rmb)\b/i,
      valueIndex: 1,
      currencyIndex: 2,
    },
  ];

  for (const matcher of matchers) {
    const match = text.match(matcher.regex);
    if (!match) {
      continue;
    }

    const amount = toMinorUnits(match[matcher.valueIndex]);
    const rawCurrency =
      matcher.currency ??
      normalizeCurrencyCode(match[matcher.currencyIndex ?? 0] ?? "");

    return {
      amount,
      currency_code: rawCurrency || defaultCurrencyCode.toLowerCase(),
    };
  }

  const numericOnly = text.match(/(\d[\d,]*(?:\.\d{1,2})?)/);
  if (!numericOnly) {
    return null;
  }

  return {
    amount: toMinorUnits(numericOnly[1]),
    currency_code: defaultCurrencyCode.toLowerCase(),
  };
}

function collectCategories(
  products: SiteBuilderProductInput[]
): SiteBuilderCategoryInput[] {
  const seen = new Map<string, string>();

  for (const product of products) {
    for (const category of product.categories ?? []) {
      seen.set(slugify(category), category);
    }
  }

  return Array.from(seen.values());
}

function normalizeCategoryCandidate(
  candidate: unknown
): SiteBuilderCategoryInput | null {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  const record = asRecord(candidate);
  const name = asString(record?.name) ?? asString(record?.title);

  if (!name) {
    return null;
  }

  return {
    name,
    handle: asString(record?.handle) ?? slugify(name),
    description: asString(record?.description) ?? undefined,
    is_active:
      typeof record?.is_active === "boolean" ? record.is_active : undefined,
    is_internal:
      typeof record?.is_internal === "boolean" ? record.is_internal : undefined,
    parent: asString(record?.parent) ?? undefined,
    metadata: asRecord(record?.metadata) ?? undefined,
  };
}

function normalizeCategoryNames(input: unknown): string[] {
  if (typeof input === "string") {
    return input
      .split(/[,|/]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  if (Array.isArray(input)) {
    return input
      .map((value) => {
        if (typeof value === "string") {
          return value.trim();
        }

        const record = asRecord(value);
        return asString(record?.name) ?? asString(record?.title) ?? null;
      })
      .filter(Boolean) as string[];
  }

  const record = asRecord(input);
  const single = asString(record?.name) ?? asString(record?.title);
  return single ? [single] : [];
}

function normalizeImageUrls(input: unknown): string[] {
  if (typeof input === "string") {
    const url = extractImageUrl(input);
    return url ? [url] : [];
  }

  if (Array.isArray(input)) {
    return input
      .map((value) => {
        if (typeof value === "string") {
          return extractImageUrl(value);
        }

        const record = asRecord(value);
        return extractImageUrl(asString(record?.url) ?? asString(record?.src));
      })
      .filter(Boolean) as string[];
  }

  const record = asRecord(input);
  const url = extractImageUrl(asString(record?.url) ?? asString(record?.src));
  return url ? [url] : [];
}

function deriveTheme(
  brandName: string,
  websiteIntro: string
): Record<string, unknown> {
  const fingerprint = `${brandName} ${websiteIntro}`.toLowerCase();

  if (/(outdoor|trail|camp|gear|nature|adventure)/.test(fingerprint)) {
    return {
      style_direction: "outdoor-editorial",
      primary_color: "#244033",
      accent_color: "#d6a85f",
      background_color: "#f4efe4",
      heading_font: "Fraunces",
      body_font: "Instrument Sans",
    };
  }

  if (/(luxury|premium|editorial|fashion|atelier|designer)/.test(fingerprint)) {
    return {
      style_direction: "luxury-editorial",
      primary_color: "#1f1a17",
      accent_color: "#c68a45",
      background_color: "#f4ede4",
      heading_font: "Cormorant Garamond",
      body_font: "Manrope",
    };
  }

  if (/(beauty|wellness|skincare|home|lifestyle)/.test(fingerprint)) {
    return {
      style_direction: "warm-lifestyle",
      primary_color: "#556046",
      accent_color: "#c78f6d",
      background_color: "#fbf5ee",
      heading_font: "Canela",
      body_font: "Avenir Next",
    };
  }

  return {
    style_direction: "modern-clean",
    primary_color: "#1f2937",
    accent_color: "#0f766e",
    background_color: "#f8fafc",
    heading_font: "Space Grotesk",
    body_font: "Inter Tight",
  };
}

function buildDefaultPages(
  brandName: string,
  websiteIntro: string,
  products: SiteBuilderProductInput[]
): Array<{ slug: string; title: string; prompt: string }> {
  const featuredProducts = products
    .slice(0, 3)
    .map((product) => product.title)
    .join(", ");

  return [
    {
      slug: "/",
      title: "Home",
      prompt: `Create a conversion-focused homepage for ${brandName}. Brand intro: ${websiteIntro}. Feature products: ${featuredProducts || "signature products"}.`,
    },
    {
      slug: "/store",
      title: "Catalog",
      prompt: `Create a browsing-friendly catalog page for ${brandName} with strong filters, category navigation, and editorial merchandising.`,
    },
    {
      slug: "/products/[handle]",
      title: "Product Detail",
      prompt: `Create a premium PDP for ${brandName} with sticky buy box, media-first gallery, specs, shipping details, and related products.`,
    },
    {
      slug: "/about",
      title: "About",
      prompt: `Tell the brand story for ${brandName} using this intro: ${websiteIntro}. Include mission, materials, and trust-building proof points.`,
    },
  ];
}

function buildDesignBrief(
  brandName: string,
  websiteIntro: string,
  primaryCategory: string,
  products: SiteBuilderProductInput[]
): string {
  const featuredProducts = products
    .slice(0, 3)
    .map((product) => product.title)
    .join(", ");

  return `${brandName} sells ${primaryCategory.toLowerCase()} and related products. ${websiteIntro} Highlight ${featuredProducts || "the hero catalog"} with a premium, conversion-focused shopping experience.`;
}

function buildDescriptionFromLines(
  lines: string[],
  input: {
    title: string;
    consumedValues: Array<string | null | undefined>;
  }
): string | null {
  const consumed = new Set(
    input.consumedValues.filter(Boolean).map((value) => value!.trim())
  );

  const descriptionLines = lines.filter((line, index) => {
    const normalized = line.trim();
    if (!normalized || normalized === input.title.trim()) {
      return false;
    }

    if (index === 0 && /^#{1,3}\s+/.test(line)) {
      return false;
    }

    if (/^[a-z ]+\s*:/i.test(normalized)) {
      return false;
    }

    return !consumed.has(normalized);
  });

  return descriptionLines.length ? descriptionLines.join(" ") : null;
}

function normalizeStatus(input: string | null): ProductStatus | null {
  if (!input) {
    return null;
  }

  const normalized = input.toLowerCase();
  return Object.values(ProductStatus).includes(normalized as ProductStatus)
    ? (normalized as ProductStatus)
    : null;
}

function normalizeCountryCode(input: unknown): string | undefined {
  const value = asString(input)?.toLowerCase();

  if (!value) {
    return undefined;
  }

  if (value.length === 2) {
    return value;
  }

  return undefined;
}

function firstCategoryName(categories: SiteBuilderCategoryInput[]): string | null {
  const first = categories[0];
  if (!first) {
    return null;
  }

  return typeof first === "string" ? first : first.name;
}

function categoryHandle(category: SiteBuilderCategoryInput): string {
  return typeof category === "string"
    ? slugify(category)
    : slugify(category.handle ?? category.name);
}

function findLineValue(lines: string[], keys: string[]): string | null {
  for (const line of lines) {
    for (const key of keys) {
      const match = line.match(
        new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+)$`, "i")
      );

      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return null;
}

function stripMarkdownDecorators(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").trim();
}

function extractImageUrl(input: string | null | undefined): string | null {
  const value = asString(input);
  if (!value) {
    return null;
  }

  const match = value.match(/https?:\/\/\S+/i);
  return match?.[0] ?? null;
}

function inferDocumentFormat(input: string): QuickstartDocumentFormat {
  const trimmed = input.trim();

  if (!trimmed) {
    return "text";
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }

  if (/^#{1,6}\s+/m.test(trimmed) || /^[-*+]\s+/m.test(trimmed)) {
    return "markdown";
  }

  return "text";
}

function looksLikeProductRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    asString(record.title) ??
      asString(record.name) ??
      asString(record.product_name)
  );
}

function fallbackPrice(defaultCurrencyCode: string) {
  return {
    amount: FALLBACK_PRICE_AMOUNT,
    currency_code: defaultCurrencyCode.toLowerCase(),
  };
}

function formatFallbackPrice(defaultCurrencyCode: string): string {
  const currency = defaultCurrencyCode.toUpperCase();
  return `${currency} ${(FALLBACK_PRICE_AMOUNT / 100).toFixed(2)}`;
}

function excerpt(input: string | null, maxLength: number): string | null {
  if (!input) {
    return null;
  }

  const compact = input.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
}

function normalizeCurrencyCode(input: string): string {
  const value = input.trim().toLowerCase();
  return value === "rmb" ? "cny" : value;
}

function toMinorUnits(input: string): number {
  const normalized = input.replace(/,/g, "");
  return Math.round(Number.parseFloat(normalized) * 100);
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

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function asRecord(
  input: unknown
): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function asString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function asArray(input: unknown): unknown[] | null {
  return Array.isArray(input) ? input : null;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
