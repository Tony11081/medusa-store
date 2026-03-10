#!/usr/bin/env node

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
  ["navy-blue", "Navy Blue"],
  ["light-blue", "Light Blue"],
  ["dark-blue", "Dark Blue"],
  ["black-on-black", "Black"],
  ["multicolor", "Multicolor"],
  ["rainbow", "Multicolor"],
]

function parseArgs(argv) {
  const config = {
    apply: false,
    backend: process.env.MEDUSA_BACKEND_URL || "",
    email: process.env.MEDUSA_ADMIN_EMAIL || "",
    password: process.env.MEDUSA_ADMIN_PASSWORD || "",
    catalog:
      process.env.FABRIC_CATALOG_PATH ||
      "/Users/chengyadong/Documents/布料/wouwww-products.json",
    maxImages: 4,
    maxLabels: 4,
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
    if (arg === "--catalog") {
      config.catalog = argv[index + 1] || config.catalog
      index += 1
      continue
    }
    if (arg === "--max-images") {
      config.maxImages = Number.parseInt(argv[index + 1] || "", 10) || config.maxImages
      index += 1
      continue
    }
    if (arg === "--max-labels") {
      config.maxLabels = Number.parseInt(argv[index + 1] || "", 10) || config.maxLabels
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
      "  node ./scripts/sync-fabric-color-variants.mjs --apply \\",
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
    for (const bridge of ["and", "on"]) {
      for (const colorB of BASE_COLORS) {
        const pattern = `${colorA}-${bridge}-${colorB}`
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

function sameStringSet(left, right) {
  const leftSet = [...new Set(left)].sort()
  const rightSet = [...new Set(right)].sort()
  return JSON.stringify(leftSet) === JSON.stringify(rightSet)
}

function buildDesiredLabels(item, maxImages, maxLabels) {
  const labels = []
  const primaryLabel = extractPrimaryLabel(item.title.replaceAll(" and ", "-and-"))

  if (primaryLabel) {
    labels.push(primaryLabel)
  }

  const brandTokens = item.brandSlug.split("-")
  for (const image of item.images.slice(0, maxImages)) {
    const baseName = image.url.toLowerCase().split("/").pop()?.split(".").slice(0, -1).join(".") || ""

    if (!brandTokens.some((token) => baseName.includes(token))) {
      continue
    }

    const label = extractPrimaryLabel(baseName)
    if (label) {
      labels.push(label)
    }
  }

  return unique(labels).slice(0, maxLabels)
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

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
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
  const payload = await requestJson(`${config.backend.replace(/\/$/, "")}/auth/user/emailpass`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
    }),
  })

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
      }
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
  })
}

async function updateColorOption(config, token, productId, optionId, values) {
  return requestJson(`${config.backend.replace(/\/$/, "")}/admin/products/${productId}/options/${optionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      values,
    }),
  })
}

async function updateVariant(config, token, productId, variantId, body) {
  return requestJson(`${config.backend.replace(/\/$/, "")}/admin/products/${productId}/variants/${variantId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
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
  })
}

async function main() {
  const config = parseArgs(process.argv.slice(2))

  if (!config.backend || !config.email || !config.password || !config.catalog) {
    usage()
    process.exit(1)
  }

  const items = JSON.parse(readFileSync(resolve(config.catalog), "utf8"))
  const token = await getToken(config)
  const products = await listProducts(config, token)
  const productsByHandle = new Map(products.map((product) => [product.handle, product]))

  const report = {
    mode: config.apply ? "apply" : "dry-run",
    totalCatalogItems: items.length,
    matchedProducts: 0,
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

    const product = productsByHandle.get(item.slug)
    if (!product) {
      report.skippedProducts += 1
      report.products.push({
        handle: item.slug,
        status: "missing-product",
      })
      continue
    }

    report.matchedProducts += 1

    const desiredLabels = buildDesiredLabels(item, config.maxImages, config.maxLabels)
    if (desiredLabels.length < 2) {
      report.skippedProducts += 1
      report.products.push({
        handle: item.slug,
        status: "single-color",
        desiredLabels,
      })
      continue
    }

    report.candidateProducts += 1

    try {
      const options = product.options || []
      const variants = product.variants || []
      if (!variants.length) {
        report.skippedProducts += 1
        report.products.push({
          handle: item.slug,
          status: "no-variants",
          desiredLabels,
        })
        continue
      }

      const sizeOption = options.find((option) => option.title !== "Color") || options[0]
      const sourceSku = item.variant?.sku
      const primaryVariant =
        variants.find((variant) => variant.sku === sourceSku) ||
        variants.find((variant) => !variantOptionMap(variant).Color) ||
        variants[0]

      const primaryOptionMap = variantOptionMap(primaryVariant)
      const sizeTitle = sizeOption?.title || "Size"
      const sizeValue =
        primaryOptionMap[sizeTitle] ||
        sizeOption?.values?.[0]?.value ||
        "1 yard"

      const colorOption = options.find((option) => option.title === "Color")
      const currentColorValues = unique(
        (colorOption?.values || []).map((value) => value.value)
      )
      const targetColorValues = unique([...desiredLabels, ...currentColorValues])

      const variantColors = new Set()
      for (const variant of variants) {
        const color = variantOptionMap(variant).Color
        if (color) {
          variantColors.add(color)
        }
      }

      const actions = {
        createColorOption: !colorOption,
        updateColorOption:
          Boolean(colorOption) &&
          !sameStringSet(currentColorValues, targetColorValues),
        updatePrimaryVariant: !variantColors.has(desiredLabels[0]) || primaryVariant.title !== `${desiredLabels[0]} / ${sizeValue}`,
        createVariants: desiredLabels.slice(1).filter((label) => !variantColors.has(label)),
      }

      report.products.push({
        handle: item.slug,
        status: config.apply ? "applied" : "dry-run",
        desiredLabels,
        actions,
      })

      if (!config.apply) {
        continue
      }

      if (actions.createColorOption) {
        await createColorOption(config, token, product.id, targetColorValues)
      } else if (actions.updateColorOption) {
        await updateColorOption(config, token, product.id, colorOption.id, targetColorValues)
      }

      if (actions.updatePrimaryVariant) {
        await updateVariant(config, token, product.id, primaryVariant.id, {
          title: `${desiredLabels[0]} / ${sizeValue}`,
          options: {
            [sizeTitle]: sizeValue,
            Color: desiredLabels[0],
          },
          prices: normalizePrices(primaryVariant),
        })
      }

      if (actions.createVariants.length) {
        const createPayload = actions.createVariants.map((label) => ({
          title: `${label} / ${sizeValue}`,
          sku: `${sourceSku || primaryVariant.sku || item.sourceHandle}-${slugifySkuPart(label)}`,
          options: {
            [sizeTitle]: sizeValue,
            Color: label,
          },
          prices: normalizePrices(primaryVariant),
          manage_inventory: false,
          metadata: {
            generated_color_variant: true,
            source_handle: item.sourceHandle,
            color_label: label,
          },
        }))

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
    matchedProducts: report.matchedProducts,
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
