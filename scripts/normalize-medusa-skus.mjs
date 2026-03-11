#!/usr/bin/env node

import { readFile } from "node:fs/promises"

function parseArgs(argv) {
  const config = {
    apply: false,
    backend: process.env.MEDUSA_BACKEND_URL || "",
    email: process.env.MEDUSA_ADMIN_EMAIL || "",
    password: process.env.MEDUSA_ADMIN_PASSWORD || "",
    token: process.env.MEDUSA_ADMIN_TOKEN || "",
    catalog: "/Users/chengyadong/Documents/布料/wouwww-products.json",
    timeoutMs: 30000,
    handles: new Set(),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--apply") {
      config.apply = true
      continue
    }
    if (arg === "--backend") {
      config.backend = next || config.backend
      index += 1
      continue
    }
    if (arg === "--email") {
      config.email = next || config.email
      index += 1
      continue
    }
    if (arg === "--password") {
      config.password = next || config.password
      index += 1
      continue
    }
    if (arg === "--token") {
      config.token = next || config.token
      index += 1
      continue
    }
    if (arg === "--catalog") {
      config.catalog = next || config.catalog
      index += 1
      continue
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = Number.parseInt(next || "", 10) || config.timeoutMs
      index += 1
      continue
    }
    if (arg === "--handle" || arg === "--handles") {
      for (const handle of String(next || "").split(",")) {
        const normalized = handle.trim()
        if (normalized) {
          config.handles.add(normalized)
        }
      }
      index += 1
      continue
    }
  }

  return config
}

function usage() {
  console.error(
    [
      "Usage:",
      "  node ./scripts/normalize-medusa-skus.mjs --apply \\",
      "    --backend http://backend.example.com \\",
      "    --email admin@example.com \\",
      "    --password 'secret'",
    ].join("\n")
  )
}

async function requestJson(url, options = {}, timeoutMs = 30000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()

  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${typeof body === "string" ? body : JSON.stringify(body)}`
    )
  }

  return body
}

async function getToken(config) {
  if (config.token) {
    return config.token
  }

  const payload = await requestJson(
    `${config.backend.replace(/\/$/, "")}/auth/user/emailpass`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: config.email,
        password: config.password,
      }),
    },
    config.timeoutMs
  )

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
      fields:
        "id,title,handle,metadata,*options,*options.values,*variants,*variants.options,*variants.metadata",
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

async function updateVariant(config, token, productId, variantId, body) {
  return requestJson(
    `${config.backend.replace(/\/$/, "")}/admin/products/${productId}/variants/${variantId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    config.timeoutMs
  )
}

function safeUpper(value) {
  return String(value || "").trim().toUpperCase()
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

function slugifySkuPart(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase()
}

function compactCode(value, length = 3) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase()

  if (!normalized) {
    return "VAR"
  }

  const direct = normalized.replace(/\s+/g, "")
  if (direct.length <= length) {
    return direct
  }

  const parts = normalized.split(/\s+/u).filter(Boolean)
  const abbreviations = {
    BLACK: "BLK",
    WHITE: "WHT",
    BROWN: "BRN",
    NAVY: "NVY",
    BLUE: "BLU",
    RED: "RED",
    GREEN: "GRN",
    PINK: "PNK",
    IVORY: "IVR",
    GOLD: "GLD",
    SILVER: "SLV",
    GRAY: "GRY",
    GREY: "GRY",
    BEIGE: "BEI",
    CREAM: "CRM",
    TAN: "TAN",
    BURGUNDY: "BRG",
    PURPLE: "PRP",
    YELLOW: "YLW",
    ORANGE: "ORG",
    OLIVE: "OLV",
    CHAMPAGNE: "CHM",
    MULTICOLOR: "MLT",
    METALLIC: "MTL",
    RAINBOW: "RNB",
    MONOGRAM: "MNG",
    CANVAS: "CNV",
    CHECKERED: "CHK",
    PATTERN: "PTR",
    BAROQUE: "BRQ",
    TIGER: "TGR",
    FORNASETTI: "FRN",
    WATERCOLOR: "WTC",
    MICKEY: "MCK",
    MINNIE: "MNI",
    DEFAULT: "DFT",
  }

  if (parts.length === 1 && abbreviations[parts[0]]) {
    return abbreviations[parts[0]]
  }

  const mapped = parts.map((part) => abbreviations[part] || part)
  const initials = mapped.map((part) => part[0]).join("")
  if (initials.length >= length) {
    return initials.slice(0, length)
  }
  if (parts.length >= 2 && initials.length === length - 1) {
    const tail = mapped[mapped.length - 1]?.slice(-1) || "X"
    return `${initials}${tail}`.slice(0, length)
  }

  const merged = mapped.join("")
  if (merged.length >= length) {
    return merged.slice(0, length)
  }

  return `${merged}XXX`.slice(0, length)
}

function dedupeCode(base, usedCodes) {
  let candidate = base
  let index = 2

  while (usedCodes.has(candidate)) {
    const suffix = String(index)
    const prefix = base.slice(0, Math.max(1, 3 - suffix.length))
    candidate = `${prefix}${suffix}`
    index += 1
  }

  usedCodes.add(candidate)
  return candidate
}

function looksLikeCompactBase(value) {
  const normalized = safeUpper(value)
  return Boolean(normalized) && /^[A-Z0-9-]{2,20}$/.test(normalized) && normalized.length <= 12
}

function extractShortCode(...values) {
  for (const value of values) {
    const source = safeUpper(value)
    if (!source) continue

    if (looksLikeCompactBase(source)) {
      return source
    }

    const matches = source.match(/\b([A-Z]{1,4}\d{1,4}[A-Z]?)\b/g)
    if (matches?.length) {
      return matches[matches.length - 1]
    }
  }

  return ""
}

function brandCode(brand) {
  const value = String(brand || "").toLowerCase()
  const overrides = {
    "louis-vuitton": "LV",
    gucci: "GUC",
    fendi: "FEN",
    dior: "DIO",
    goyard: "GOY",
    burberry: "BUR",
    versace: "VER",
    guess: "GUE",
    mcm: "MCM",
  }

  if (overrides[value]) {
    return overrides[value]
  }

  return compactCode(value, 3)
}

function categoryCode(category) {
  const value = String(category || "").toLowerCase()
  const overrides = {
    jacquard: "JAC",
    leather: "LEA",
    vinyl: "VIN",
    lining: "LIN",
    upholstery: "UPH",
    cotton: "COT",
    denim: "DEN",
    canvas: "CAN",
    nylon: "NYL",
  }

  if (overrides[value]) {
    return overrides[value]
  }

  return compactCode(value, 3)
}

function inferCatalogContext(product, catalogItem) {
  const handle = String(product.handle || "")
  const title = String(product.title || "")
  const base = {
    isCatalog: Boolean(catalogItem),
    brand: catalogItem?.brandSlug || "",
    category: catalogItem?.categorySlug || "",
    sourceHandle: catalogItem?.sourceHandle || "",
    sourceSku: catalogItem?.variant?.sku || "",
  }

  if (!base.brand) {
    const candidates = ["louis-vuitton", "gucci", "fendi", "dior", "goyard", "burberry", "versace", "guess", "mcm"]
    base.brand = candidates.find((candidate) => handle.includes(candidate) || title.toLowerCase().includes(candidate)) || ""
  }

  if (!base.category) {
    const lower = `${handle} ${title}`.toLowerCase()
    for (const candidate of ["jacquard", "leather", "vinyl", "lining", "upholstery", "cotton", "denim", "canvas", "nylon"]) {
      if (lower.includes(candidate)) {
        base.category = candidate
        break
      }
    }
  }

  return base
}

function buildGeneratedBaseCodes(products, catalogBySlug) {
  const assignments = new Map()
  const groups = new Map()

  for (const product of products) {
    const catalogItem = catalogBySlug.get(product.handle)
    const context = inferCatalogContext(product, catalogItem)
    const explicit = extractShortCode(context.sourceSku, context.sourceHandle, product.handle, product.title)

    if (explicit) {
      assignments.set(product.id, explicit)
      continue
    }

    const handleBase = slugifySkuPart(product.handle)
    if (!catalogItem && handleBase && handleBase.length <= 32) {
      assignments.set(product.id, handleBase)
      continue
    }

    const brand = brandCode(context.brand || "GEN")
    const category = categoryCode(context.category || "ITEM")
    const key = `${brand}-${category}`

    if (!groups.has(key)) {
      groups.set(key, [])
    }

    groups.get(key).push(product)
  }

  for (const [key, group] of groups.entries()) {
    const sorted = [...group].sort((left, right) => String(left.handle).localeCompare(String(right.handle)))
    sorted.forEach((product, index) => {
      assignments.set(product.id, `${key}-${String(index + 1).padStart(2, "0")}`)
    })
  }

  return assignments
}

function countDistinctOptionValues(product, optionTitle) {
  const values = new Set()
  for (const variant of product.variants || []) {
    const options = variantOptionMap(variant)
    if (options[optionTitle]) {
      values.add(options[optionTitle])
    }
  }
  return values.size
}

function needsSkuWork(product, catalogItem) {
  if (catalogItem) {
    return true
  }

  return (product.variants || []).some((variant) => {
    const sku = String(variant.sku || "").trim()
    return !sku || sku.length > 32 || /\s/.test(sku) || /[^A-Z0-9-]/.test(sku)
  })
}

function buildTargetSkus(product, baseSku, catalogItem) {
  const variants = product.variants || []
  const hasColorOption = (product.options || []).some((option) => option.title === "Color")
  const distinctColors = countDistinctOptionValues(product, "Color")
  const distinctSizes = countDistinctOptionValues(product, "Size")
  const usedColorCodes = new Set()
  const usedSizeCodes = new Set()
  const targets = []

  for (const variant of variants) {
    const optionMap = variantOptionMap(variant)
    const color = String(optionMap.Color || variant.metadata?.color_label || "").trim()
    const size = String(optionMap.Size || "").trim()
    let sku = baseSku

    if (catalogItem) {
      if (hasColorOption && distinctColors > 1 && color) {
        const colorCode = dedupeCode(compactCode(color, 3), usedColorCodes)
        sku = `${baseSku}-${colorCode}`
      }
    } else if ((String(variant.sku || "").trim() === "" || distinctSizes > 1 || distinctColors > 1)) {
      const parts = [baseSku]
      if (distinctSizes > 1 && size) {
        parts.push(dedupeCode(compactCode(size, 3), usedSizeCodes))
      }
      if (distinctColors > 1 && color) {
        parts.push(dedupeCode(compactCode(color, 3), usedColorCodes))
      }
      sku = parts.join("-")
    }

    targets.push({
      variantId: variant.id,
      currentSku: String(variant.sku || ""),
      targetSku: sku,
      title: variant.title,
    })
  }

  return targets
}

async function main() {
  const config = parseArgs(process.argv.slice(2))

  if (!config.backend || (!config.token && (!config.email || !config.password))) {
    usage()
    process.exit(1)
  }

  const catalog = JSON.parse(await readFile(config.catalog, "utf8"))
  const catalogBySlug = new Map(catalog.map((item) => [item.slug, item]))
  const token = await getToken(config)
  const products = await listProducts(config, token)
  const generatedBaseCodes = buildGeneratedBaseCodes(products, catalogBySlug)

  const summary = {
    mode: config.apply ? "apply" : "dry-run",
    totalProducts: products.length,
    touchedProducts: 0,
    updatedVariants: 0,
    skippedProducts: 0,
    errors: [],
    products: [],
  }

  for (const product of products) {
    if (config.handles.size && !config.handles.has(product.handle)) {
      summary.skippedProducts += 1
      continue
    }

    const catalogItem = catalogBySlug.get(product.handle)

    if (!needsSkuWork(product, catalogItem)) {
      summary.skippedProducts += 1
      continue
    }

    const baseSku = generatedBaseCodes.get(product.id) || slugifySkuPart(product.handle).slice(0, 24)
    const targets = buildTargetSkus(product, baseSku, catalogItem)
    const changes = targets.filter((item) => item.currentSku !== item.targetSku)

    if (!changes.length) {
      summary.skippedProducts += 1
      continue
    }

    summary.products.push({
      handle: product.handle,
      title: product.title,
      baseSku,
      changes,
    })

    if (!config.apply) {
      continue
    }

    try {
      for (const change of changes) {
        await updateVariant(config, token, product.id, change.variantId, {
          sku: change.targetSku,
        })
      }
      summary.touchedProducts += 1
      summary.updatedVariants += changes.length
    } catch (error) {
      summary.errors.push({
        handle: product.handle,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!config.apply) {
    summary.touchedProducts = summary.products.length
    summary.updatedVariants = summary.products.reduce((count, product) => count + product.changes.length, 0)
  }

  console.log(JSON.stringify(summary, null, 2))

  if (summary.errors.length) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
