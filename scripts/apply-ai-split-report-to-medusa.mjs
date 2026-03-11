#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function parseArgs(argv) {
  const config = {
    apply: false,
    backend: process.env.MEDUSA_BACKEND_URL || "",
    email: process.env.MEDUSA_ADMIN_EMAIL || "",
    password: process.env.MEDUSA_ADMIN_PASSWORD || "",
    token: process.env.MEDUSA_ADMIN_TOKEN || "",
    report: "",
    catalog: "/Users/chengyadong/Documents/布料/wouwww-products.json",
    sourceHandles: new Set(),
    timeoutMs: 30000,
    skipIfColored: true,
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
    if (arg === "--report") {
      config.report = next || config.report
      index += 1
      continue
    }
    if (arg === "--catalog") {
      config.catalog = next || config.catalog
      index += 1
      continue
    }
    if (arg === "--source-handles") {
      for (const handle of String(next || "").split(",")) {
        const normalized = handle.trim()
        if (normalized) {
          config.sourceHandles.add(normalized)
        }
      }
      index += 1
      continue
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = Number.parseInt(next || "", 10) || config.timeoutMs
      index += 1
      continue
    }
    if (arg === "--include-colored") {
      config.skipIfColored = false
      continue
    }
  }

  return config
}

function usage() {
  console.error(
    [
      "Usage:",
      "  node ./scripts/apply-ai-split-report-to-medusa.mjs --apply \\",
      "    --report /tmp/wouwww_shopify_remaining.report.json \\",
      "    --backend http://backend.example.com \\",
      "    --token <admin-jwt> \\",
      "    --source-handles fl03,lo01",
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

async function createColorOption(config, token, productId, values) {
  return requestJson(
    `${config.backend.replace(/\/$/, "")}/admin/products/${productId}/options`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Color",
        values,
      }),
    },
    config.timeoutMs
  )
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

async function batchCreateVariants(config, token, productId, create) {
  return requestJson(
    `${config.backend.replace(/\/$/, "")}/admin/products/${productId}/variants/batch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        create,
      }),
    },
    config.timeoutMs
  )
}

async function main() {
  const config = parseArgs(process.argv.slice(2))

  if (
    !config.backend ||
    !config.report ||
    (!config.token && (!config.email || !config.password))
  ) {
    usage()
    process.exit(1)
  }

  const report = JSON.parse(readFileSync(resolve(config.report), "utf8"))
  const catalog = JSON.parse(readFileSync(resolve(config.catalog), "utf8"))
  const catalogBySourceHandle = new Map(catalog.map((item) => [item.sourceHandle, item]))
  const token = await getToken(config)
  const products = await listProducts(config, token)
  const productsByHandle = new Map(products.map((product) => [product.handle, product]))

  const targets = (report.results || []).filter((item) => {
    if (config.sourceHandles.size && !config.sourceHandles.has(item.handle)) {
      return false
    }
    return Array.isArray(item.variants) && item.variants.length >= 2
  })

  const summary = {
    mode: config.apply ? "apply" : "dry-run",
    candidateCount: targets.length,
    updatedProducts: 0,
    createdVariants: 0,
    skippedProducts: 0,
    errors: [],
    products: [],
  }

  for (const target of targets) {
    const catalogItem = catalogBySourceHandle.get(target.handle)
    if (!catalogItem) {
      summary.skippedProducts += 1
      summary.products.push({
        sourceHandle: target.handle,
        status: "missing-catalog-item",
      })
      continue
    }

    const product = productsByHandle.get(catalogItem.slug)
    if (!product) {
      summary.skippedProducts += 1
      summary.products.push({
        sourceHandle: target.handle,
        handle: catalogItem.slug,
        status: "missing-product",
      })
      continue
    }

    const colorOption = (product.options || []).find((option) => option.title === "Color")
    if (colorOption && config.skipIfColored) {
      summary.skippedProducts += 1
      summary.products.push({
        sourceHandle: target.handle,
        handle: catalogItem.slug,
        status: "already-colored",
      })
      continue
    }

    const primaryVariant = (product.variants || [])[0]
    if (!primaryVariant) {
      summary.skippedProducts += 1
      summary.products.push({
        sourceHandle: target.handle,
        handle: catalogItem.slug,
        status: "no-primary-variant",
      })
      continue
    }

    const sizeOption = (product.options || [])[0]
    const primaryOptionMap = variantOptionMap(primaryVariant)
    const sizeTitle = sizeOption?.title || "Size"
    const sizeValue =
      primaryOptionMap[sizeTitle] ||
      sizeOption?.values?.[0]?.value ||
      catalogItem.variant?.size ||
      "1 yard"

    const desiredVariants = [...target.variants]
    const primary =
      desiredVariants.find((variant) => variant.is_primary) || desiredVariants[0]
    const nonPrimary = desiredVariants.filter((variant) => variant !== primary)
    const colorValues = desiredVariants.map((variant) => variant.color)

    summary.products.push({
      sourceHandle: target.handle,
      handle: catalogItem.slug,
      status: config.apply ? "applied" : "dry-run",
      colors: colorValues,
    })

    if (!config.apply) {
      continue
    }

    try {
      if (!colorOption) {
        await createColorOption(config, token, product.id, colorValues)
      }

      await updateVariant(config, token, product.id, primaryVariant.id, {
        title: `${primary.color} / ${sizeValue}`,
        sku: primary.sku,
        options: {
          [sizeTitle]: sizeValue,
          Color: primary.color,
        },
        prices: normalizePrices(primaryVariant),
        metadata: {
          generated_from_ai_split: true,
          source_handle: target.handle,
          color_label: primary.color,
          image_url: primary.image_urls?.[0] || null,
        },
      })

      const createPayload = nonPrimary.map((variant) => ({
        title: `${variant.color} / ${sizeValue}`,
        sku: variant.sku,
        options: {
          [sizeTitle]: sizeValue,
          Color: variant.color,
        },
        prices: normalizePrices(primaryVariant),
        manage_inventory: false,
        metadata: {
          generated_from_ai_split: true,
          source_handle: target.handle,
          color_label: variant.color,
          image_url: variant.image_urls?.[0] || null,
        },
      }))

      if (createPayload.length) {
        await batchCreateVariants(config, token, product.id, createPayload)
        summary.createdVariants += createPayload.length
      }

      summary.updatedProducts += 1
    } catch (error) {
      summary.errors.push({
        sourceHandle: target.handle,
        handle: catalogItem.slug,
        message: error instanceof Error ? error.message : String(error),
      })
    }
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
