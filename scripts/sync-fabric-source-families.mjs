#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const BASE_COLORS = [
  "black",
  "white",
  "brown",
  "blue",
  "green",
  "red",
  "pink",
  "ivory",
  "cream",
  "beige",
  "gray",
  "grey",
  "gold",
  "silver",
  "orange",
  "purple",
  "yellow",
  "tan",
  "champagne",
]

const SPECIAL_LABELS = [
  ["navy blue", "Navy Blue"],
  ["light blue", "Light Blue"],
  ["dark blue", "Dark Blue"],
  ["multicolor", "Multicolor"],
  ["rainbow", "Multicolor"],
]

function parseArgs(argv) {
  const config = {
    apply: false,
    backend: process.env.MEDUSA_BACKEND_URL || "",
    email: process.env.MEDUSA_ADMIN_EMAIL || "",
    password: process.env.MEDUSA_ADMIN_PASSWORD || "",
    token: process.env.MEDUSA_ADMIN_TOKEN || "",
    catalog:
      process.env.FABRIC_CATALOG_PATH ||
      "/Users/chengyadong/Documents/布料/wouwww-products.json",
    sourceOrigin: "https://wouwww.com",
    maxLabels: 6,
    concurrency: 6,
    timeoutMs: 15000,
    limit: 0,
    report: "",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--apply") {
      config.apply = true
      continue
    }
    if (arg === "--backend") {
      config.backend = argv[index + 1] || config.backend
      index += 1
      continue
    }
    if (arg === "--email") {
      config.email = argv[index + 1] || config.email
      index += 1
      continue
    }
    if (arg === "--password") {
      config.password = argv[index + 1] || config.password
      index += 1
      continue
    }
    if (arg === "--token") {
      config.token = argv[index + 1] || config.token
      index += 1
      continue
    }
    if (arg === "--catalog") {
      config.catalog = argv[index + 1] || config.catalog
      index += 1
      continue
    }
    if (arg === "--source-origin") {
      config.sourceOrigin = argv[index + 1] || config.sourceOrigin
      index += 1
      continue
    }
    if (arg === "--max-labels") {
      config.maxLabels = Number.parseInt(argv[index + 1] || "", 10) || config.maxLabels
      index += 1
      continue
    }
    if (arg === "--concurrency") {
      config.concurrency = Number.parseInt(argv[index + 1] || "", 10) || config.concurrency
      index += 1
      continue
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = Number.parseInt(argv[index + 1] || "", 10) || config.timeoutMs
      index += 1
      continue
    }
    if (arg === "--limit") {
      config.limit = Number.parseInt(argv[index + 1] || "", 10) || 0
      index += 1
      continue
    }
    if (arg === "--report") {
      config.report = argv[index + 1] || ""
      index += 1
    }
  }

  return config
}

function usage() {
  console.error(
    [
      "Usage:",
      "  node ./scripts/sync-fabric-source-families.mjs --apply \\",
      "    --backend http://backend.example.com \\",
      "    --email admin@example.com \\",
      "    --password '<password>' \\",
      "    --catalog /path/to/wouwww-products.json",
    ].join("\n")
  )
}

function normalizeColorToken(token) {
  if (!token) {
    return null
  }

  if (token === "grey") {
    return "Gray"
  }

  return token
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function extractPrimaryLabel(input) {
  const source = input.toLowerCase()

  for (const [pattern, label] of SPECIAL_LABELS) {
    if (source.includes(pattern)) {
      return label
    }
  }

  for (const colorA of BASE_COLORS) {
    for (const bridge of [" and ", " on "]) {
      for (const colorB of BASE_COLORS) {
        const pattern = `${colorA}${bridge}${colorB}`
        if (source.includes(pattern)) {
          const left = normalizeColorToken(colorA)
          const right = normalizeColorToken(colorB)
          return left === right ? left : `${left} / ${right}`
        }
      }
    }
  }

  const matches = []
  for (const color of BASE_COLORS) {
    const matcher = new RegExp(`(^|[^a-z])${color}([^a-z]|$)`, "g")
    for (const match of source.matchAll(matcher)) {
      matches.push({ index: match.index ?? 0, color })
    }
  }

  if (!matches.length) {
    return null
  }

  matches.sort((left, right) => left.index - right.index)
  return normalizeColorToken(matches[0].color)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function slugifySkuPart(value) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toUpperCase()
}

function variantOptionMap(variant) {
  const map = {}
  for (const optionValue of variant.options || []) {
    const title = optionValue.option?.title
    if (title) {
      map[title] = optionValue.value
    }
  }
  return map
}

function normalizePrices(variant) {
  return (variant.prices || []).map((price) => ({
    amount: price.amount,
    currency_code: price.currency_code,
    min_quantity: price.min_quantity ?? undefined,
    max_quantity: price.max_quantity ?? undefined,
  }))
}

function stripHtml(input) {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeSourceContent(input) {
  const stripped = stripHtml(input).toLowerCase()
  const normalized = stripped
    .replace(/\d+[,.]?\d*/g, "<n>")
    .replace(/[^a-z<>% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (normalized.length < 40) {
    return null
  }

  return createHash("md5").update(normalized).digest("hex")
}

async function requestJson(url, options = {}, timeoutMs = 15000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()

  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch (error) {
    body = text
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof body === "string" ? body : JSON.stringify(body)}`)
  }

  return body
}

async function getToken(config) {
  if (config.token) {
    return config.token
  }

  const payload = await requestJson(`${config.backend.replace(/\/$/, "")}/auth/user/emailpass`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
    }),
  }, config.timeoutMs)

  return payload.token
}

async function listProducts(config, token) {
  const products = []
  const limit = 100
  let offset = 0

  while (true) {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      fields: "id,title,handle,*options,*options.values,*variants,*variants.options,*variants.prices",
    })

    const payload = await requestJson(
      `${config.backend.replace(/\/$/, "")}/admin/products?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      config.timeoutMs
    )

    products.push(...(payload.products || []))

    if (products.length >= (payload.count || 0) || !(payload.products || []).length) {
      break
    }

    offset += limit
  }

  return products
}

async function createColorOption(config, token, productId, values) {
  return requestJson(`${config.backend.replace(/\/$/, "")}/admin/products/${productId}/options`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      title: "Color",
      values,
    }),
  }, config.timeoutMs)
}

async function updateVariant(config, token, productId, variantId, body) {
  return requestJson(`${config.backend.replace(/\/$/, "")}/admin/products/${productId}/variants/${variantId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }, config.timeoutMs)
}

async function batchCreateVariants(config, token, productId, create) {
  return requestJson(`${config.backend.replace(/\/$/, "")}/admin/products/${productId}/variants/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      create,
    }),
  }, config.timeoutMs)
}

async function resolveOneSourceMetadata(config, item) {
  const searchUrl = new URL("/wp-json/wp/v2/search", config.sourceOrigin)
  searchUrl.searchParams.set("search", item.sourceHandle.toUpperCase())
  searchUrl.searchParams.set("subtype", "product")

  let searchResults = []
  try {
    searchResults = await requestJson(searchUrl.toString(), {}, config.timeoutMs)
  } catch (error) {
    return {
      handle: item.sourceHandle,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const match =
    searchResults.find((entry) =>
      String(entry.title || "").toLowerCase().includes(item.sourceHandle.toLowerCase())
    ) || searchResults[0]

  if (!match) {
    return {
      handle: item.sourceHandle,
      notFound: true,
    }
  }

  const productHref = match._links?.self?.[0]?.href
  let sourceContent = ""
  let sourceTitle = String(match.title || "")

  if (productHref) {
    try {
      const productPayload = await requestJson(productHref, {}, config.timeoutMs)
      sourceTitle = stripHtml(productPayload.title?.rendered || sourceTitle)
      sourceContent = productPayload.content?.rendered || ""
    } catch (error) {
      return {
        handle: item.sourceHandle,
        title: sourceTitle,
        url: match.url,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return {
    handle: item.sourceHandle,
    title: sourceTitle,
    url: match.url,
    contentHash: normalizeSourceContent(sourceContent),
  }
}

async function resolveSourceMetadata(config, items) {
  const metadataByHandle = new Map()
  const uniqueItems = [...new Map(items.map((item) => [item.sourceHandle, item])).values()]
  let nextIndex = 0
  let completed = 0

  const workers = Array.from({ length: Math.max(1, config.concurrency) }, async () => {
    while (nextIndex < uniqueItems.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      const item = uniqueItems[currentIndex]
      const metadata = await resolveOneSourceMetadata(config, item)
      metadataByHandle.set(item.sourceHandle, metadata)
      completed += 1

      if (completed % 20 === 0 || completed === uniqueItems.length) {
        console.error(
          `[source-families] resolved ${completed}/${uniqueItems.length} source handles`
        )
      }
    }
  })

  await Promise.all(workers)
  return metadataByHandle
}

function buildFamilyLabels(items, metadataByHandle, maxLabels) {
  const groupedHandles = new Map()

  for (const item of items) {
    const metadata = metadataByHandle.get(item.sourceHandle)
    const familyFingerprint =
      normalizeSourceContent(item.description || "") || metadata?.contentHash || null

    if (!familyFingerprint) {
      continue
    }

    const key = `${item.brandSlug}::${item.categorySlug}::${familyFingerprint}`
    const group = groupedHandles.get(key) || []
    group.push(item)
    groupedHandles.set(key, group)
  }

  const labelsByHandle = new Map()

  for (const group of groupedHandles.values()) {
    const familyLabels = unique(
      group.map((item) => {
        const metadata = metadataByHandle.get(item.sourceHandle)
        return extractPrimaryLabel(metadata?.title || item.title)
      })
    ).slice(0, maxLabels)

    if (familyLabels.length < 2) {
      continue
    }

    for (const item of group) {
      labelsByHandle.set(item.sourceHandle, familyLabels)
    }
  }

  return labelsByHandle
}

async function main() {
  const config = parseArgs(process.argv.slice(2))

  if (!config.backend || (!config.token && (!config.email || !config.password)) || !config.catalog) {
    usage()
    process.exit(1)
  }

  const items = JSON.parse(readFileSync(resolve(config.catalog), "utf8"))
  const token = await getToken(config)
  const products = await listProducts(config, token)
  const productsByHandle = new Map(products.map((product) => [product.handle, product]))
  const metadataByHandle = await resolveSourceMetadata(config, items)
  const labelsByHandle = buildFamilyLabels(items, metadataByHandle, config.maxLabels)

  const report = {
    mode: config.apply ? "apply" : "dry-run",
    totalCatalogItems: items.length,
    sourceResolved: 0,
    candidateProducts: 0,
    updatedProducts: 0,
    createdVariants: 0,
    skippedProducts: 0,
    errors: [],
    products: [],
  }

  for (const item of items) {
    if (config.limit && report.products.length >= config.limit) {
      break
    }

    const sourceMetadata = metadataByHandle.get(item.sourceHandle)
    if (sourceMetadata?.contentHash) {
      report.sourceResolved += 1
    }

    const product = productsByHandle.get(item.slug)
    if (!product) {
      report.skippedProducts += 1
      report.products.push({
        handle: item.slug,
        status: "missing-product",
      })
      continue
    }

    const desiredLabels = labelsByHandle.get(item.sourceHandle) || []
    const colorOption = (product.options || []).find((option) => option.title === "Color")
    const hasColorVariants = Boolean(colorOption) || (product.variants || []).length > 1

    if (!desiredLabels.length) {
      report.skippedProducts += 1
      report.products.push({
        handle: item.slug,
        status: "no-family",
      })
      continue
    }

    if (hasColorVariants) {
      report.skippedProducts += 1
      report.products.push({
        handle: item.slug,
        status: "already-colored",
        desiredLabels,
      })
      continue
    }

    report.candidateProducts += 1

    try {
      const options = product.options || []
      const variants = product.variants || []
      const primaryVariant = variants[0]

      if (!primaryVariant) {
        report.skippedProducts += 1
        report.products.push({
          handle: item.slug,
          status: "no-variant",
          desiredLabels,
        })
        continue
      }

      const sizeOption = options[0]
      const primaryOptionMap = variantOptionMap(primaryVariant)
      const sizeTitle = sizeOption?.title || "Size"
      const sizeValue =
        primaryOptionMap[sizeTitle] ||
        sizeOption?.values?.[0]?.value ||
        "1 yard"

      report.products.push({
        handle: item.slug,
        status: config.apply ? "applied" : "dry-run",
        desiredLabels,
        sourceTitle: sourceMetadata?.title || null,
      })

      if (!config.apply) {
        continue
      }

      await createColorOption(config, token, product.id, desiredLabels)

      await updateVariant(config, token, product.id, primaryVariant.id, {
        title: `${desiredLabels[0]} / ${sizeValue}`,
        options: {
          [sizeTitle]: sizeValue,
          Color: desiredLabels[0],
        },
        prices: normalizePrices(primaryVariant),
      })

      const createPayload = desiredLabels.slice(1).map((label) => ({
        title: `${label} / ${sizeValue}`,
        sku: `${item.variant?.sku || primaryVariant.sku || item.sourceHandle}-${slugifySkuPart(label)}`,
        options: {
          [sizeTitle]: sizeValue,
          Color: label,
        },
        prices: normalizePrices(primaryVariant),
        manage_inventory: false,
        metadata: {
          generated_from_source_family: true,
          source_handle: item.sourceHandle,
          source_url: sourceMetadata?.url || null,
          color_label: label,
        },
      }))

      if (createPayload.length) {
        await batchCreateVariants(config, token, product.id, createPayload)
        report.createdVariants += createPayload.length
      }

      report.updatedProducts += 1
    } catch (error) {
      report.errors.push({
        handle: item.slug,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const summary = {
    mode: report.mode,
    totalCatalogItems: report.totalCatalogItems,
    sourceResolved: report.sourceResolved,
    candidateProducts: report.candidateProducts,
    updatedProducts: report.updatedProducts,
    createdVariants: report.createdVariants,
    skippedProducts: report.skippedProducts,
    errorCount: report.errors.length,
  }

  if (config.report) {
    writeFileSync(resolve(config.report), JSON.stringify(report, null, 2))
  }

  console.log(JSON.stringify({ summary, products: report.products.slice(0, 25), errors: report.errors }, null, 2))

  if (report.errors.length) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
