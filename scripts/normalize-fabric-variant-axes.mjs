#!/usr/bin/env node

const OVERRIDES = {
  "louis-vuitton-fornasetti-fabric-ll33": {
    optionTitle: "Pattern",
    labels: {
      Brown: "Fornasetti",
      "Monogram Canvas": "Monogram",
      Grey: "Grey",
      Multicolor: "Watercolor",
      Red: "Red Reflective",
    },
  },
  "louis-vuitton-mini-patterned-leather-ll76": {
    optionTitle: "Pattern",
    labels: {
      "Monogram Canvas": "Monogram",
      "Elastic Stretching": "Stretch",
      "Watercolor Multicolor": "Watercolor",
      "Navy Empreinte": "Navy Empreinte",
      "Transitioning Colors": "Ombre",
    },
  },
  "louis-vuitton-liner-fabric-for-bags-and-purses-lo11": {
    optionTitle: "Color",
    labels: {
      Beige: "Beige",
      Brown: "Brown",
      "Dark Red": "Dark Red",
      Burgundy: "Burgundy",
      "Gucci Beige": "Beige Monogram",
      "Brown Gucci": "Brown Monogram",
      "Brown Damier": "Brown Checkered",
      Blue: "Blue Pattern",
    },
  },
  "louis-vuitton-mickey-mouse-fabric-with-mickey-and-minnie-mouse-pattern-ll29": {
    optionTitle: "Pattern",
    labels: {
      Fornasetti: "Fornasetti",
      "Tan with Black Pattern": "Tan / Black",
      "1854 Fabric": "1854",
      "Blue Reflective Titanium": "Blue Reflective",
      "Mickey and Minnie Mouse": "Mickey & Minnie",
      "Watercolor Multicolor": "Watercolor",
      "Watercolor Black and White": "Black / White",
      "Rainbow White": "Rainbow White",
    },
  },
}

function parseArgs(argv) {
  const config = {
    apply: false,
    backend: process.env.MEDUSA_BACKEND_URL || "",
    email: process.env.MEDUSA_ADMIN_EMAIL || "",
    password: process.env.MEDUSA_ADMIN_PASSWORD || "",
    token: process.env.MEDUSA_ADMIN_TOKEN || "",
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
    }
  }

  return config
}

function usage() {
  console.error(
    [
      "Usage:",
      "  node ./scripts/normalize-fabric-variant-axes.mjs --apply \\",
      "    --backend http://backend.example.com \\",
      "    --email admin@example.com \\",
      "    --password 'secret'",
    ].join("\n")
  )
}

async function requestJson(config, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(config.timeoutMs),
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
    config,
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
    }
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
      config,
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

async function updateOption(config, token, productId, optionId, body) {
  return requestJson(
    config,
    `${config.backend.replace(/\/$/, "")}/admin/products/${productId}/options/${optionId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  )
}

async function updateVariant(config, token, productId, variantId, body) {
  return requestJson(
    config,
    `${config.backend.replace(/\/$/, "")}/admin/products/${productId}/variants/${variantId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  )
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

function compactCode(value, length = 6) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase()

  if (!normalized) {
    return "VAR"
  }

  const collapsed = normalized.replace(/\s+/g, "")
  if (collapsed.length <= length) {
    return collapsed
  }

  return collapsed.slice(0, length)
}

function getBaseSku(variant, product) {
  const current = String(variant.sku || "").trim()
  if (!current) {
    return slugifySkuPart(product.handle).slice(0, 24)
  }

  return current.replace(/-[A-Z0-9]{2,6}$/u, "") || current
}

async function main() {
  const config = parseArgs(process.argv.slice(2))

  if (!config.backend || (!config.token && (!config.email || !config.password))) {
    usage()
    process.exit(1)
  }

  const desiredHandles = config.handles.size
    ? [...config.handles]
    : Object.keys(OVERRIDES)

  const token = await getToken(config)
  const products = await listProducts(config, token)
  const productsByHandle = new Map(products.map((product) => [product.handle, product]))

  const summary = {
    mode: config.apply ? "apply" : "dry-run",
    candidateCount: desiredHandles.length,
    updatedProducts: 0,
    updatedVariants: 0,
    errors: [],
    products: [],
  }

  for (const handle of desiredHandles) {
    const override = OVERRIDES[handle]
    if (!override) {
      summary.errors.push({ handle, message: "missing-override" })
      continue
    }

    const product = productsByHandle.get(handle)
    if (!product) {
      summary.errors.push({ handle, message: "missing-product" })
      continue
    }

    const option = (product.options || []).find((entry) =>
      ["color", "pattern", "finish"].includes(entry.title?.toLowerCase() || "")
    )

    if (!option) {
      summary.errors.push({ handle, message: "missing-variant-axis-option" })
      continue
    }

    const sizeOption = (product.options || []).find(
      (entry) => entry.id !== option.id
    )
    const sizeTitle = sizeOption?.title || "Size"
    const values = Object.values(override.labels)
    const variantChanges = []

    for (const variant of product.variants || []) {
      const optionMap = variantOptionMap(variant)
      const currentValue = optionMap[option.title]
      const nextValue = override.labels[currentValue]

      if (!nextValue) {
        summary.errors.push({
          handle,
          message: `unmapped-variant-value:${currentValue || "unknown"}`,
        })
        continue
      }

      const sizeValue = optionMap[sizeTitle] || sizeOption?.values?.[0]?.value || "1 yard"
      const baseSku = getBaseSku(variant, product)
      const nextSku = `${baseSku}-${compactCode(nextValue)}`

      variantChanges.push({
        id: variant.id,
        currentValue,
        nextValue,
        sizeValue,
        nextSku,
        metadata: {
          ...(variant.metadata || {}),
          color_label: nextValue,
        },
      })
    }

    summary.products.push({
      handle,
      optionBefore: option.title,
      optionAfter: override.optionTitle,
      values,
      variants: variantChanges.map((change) => ({
        from: change.currentValue,
        to: change.nextValue,
        sku: change.nextSku,
      })),
    })

    if (!config.apply) {
      continue
    }

    try {
      await updateOption(config, token, product.id, option.id, {
        title: override.optionTitle,
        values,
      })

      for (const change of variantChanges) {
        await updateVariant(config, token, product.id, change.id, {
          title: `${change.nextValue} / ${change.sizeValue}`,
          sku: change.nextSku,
          options: {
            [sizeTitle]: change.sizeValue,
            [override.optionTitle]: change.nextValue,
          },
          metadata: change.metadata,
        })
      }

      summary.updatedProducts += 1
      summary.updatedVariants += variantChanges.length
    } catch (error) {
      summary.errors.push({
        handle,
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
