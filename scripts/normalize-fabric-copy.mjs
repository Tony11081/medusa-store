#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const BRAND_NAMES = {
  burberry: "Burberry",
  dior: "Dior",
  fendi: "Fendi",
  goyard: "Goyard",
  guess: "Guess",
  gucci: "Gucci",
  "louis-vuitton": "Louis Vuitton",
  mcm: "MCM",
  versace: "Versace",
}

const COLOR_PHRASES = [
  "very light green",
  "mint green",
  "light brown",
  "light blue",
  "light green",
  "olive green",
  "dirty white",
  "reddish brown",
  "dusty rose",
  "navy blue",
  "dark blue",
  "dark gray",
  "dark grey",
  "dark brown",
  "pinkish",
  "magenta purple",
  "champagne",
  "multicolor",
  "multi color",
  "beige",
  "black",
  "blue",
  "brown",
  "cream",
  "gray",
  "grey",
  "green",
  "ivory",
  "magenta",
  "navy",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "tan",
  "white",
  "yellow",
]

const MATERIAL_TITLE_SUFFIX = {
  Canvas: "Canvas Fabric",
  Cotton: "Cotton Fabric",
  Denim: "Denim Fabric",
  Jacquard: "Jacquard Fabric",
  Leather: "Leather",
  Lining: "Lining Fabric",
  "Upholstery Fabric": "Upholstery Fabric",
  Vinyl: "Vinyl Fabric",
  "Designer Textile": "Designer Textile",
}

const MATERIAL_DESCRIPTION_LABEL = {
  Canvas: "canvas fabric",
  Cotton: "cotton fabric",
  Denim: "denim fabric",
  Jacquard: "jacquard fabric",
  Leather: "leather",
  Lining: "lining fabric",
  "Upholstery Fabric": "upholstery fabric",
  Vinyl: "vinyl fabric",
  "Designer Textile": "designer textile",
}

const USE_CASE_LABELS = {
  Canvas:
    "Best for lining projects, soft goods, bag making, decorative trim, and lighter custom fabrication.",
  Cotton:
    "Best for shirts, scarves, soft goods, bag making, decorative trim, and lighter custom fabrication.",
  Denim:
    "Best for statement soft goods, trims, bags, panels, and lighter upholstery-adjacent projects.",
  Jacquard:
    "Best for statement upholstery, cushions, benches, decorative panels, and soft furnishings.",
  Leather:
    "Best for upholstery accents, wall panels, trim, structured bags, and custom fabrication.",
  Lining:
    "Best for bag lining, soft goods, decorative trim, and lighter custom projects.",
  "Upholstery Fabric":
    "Best for upholstery accents, headboards, wall panels, trim, and custom fabrication.",
  Vinyl:
    "Best for upholstery accents, headboards, wall panels, trim, and custom fabrication.",
  "Designer Textile":
    "Suitable for interiors, soft furnishings, and custom decorative work.",
}

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
    timeoutMs: 30000,
    report: "",
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
    if (arg === "--report") {
      config.report = next || ""
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
      "  node ./scripts/normalize-fabric-copy.mjs --apply \\",
      "    --backend http://backend.example.com \\",
      "    --email admin@example.com \\",
      "    --password '<password>'",
    ].join("\n")
  )
}

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function requestTimeout(config) {
  return AbortSignal.timeout(config.timeoutMs)
}

async function requestJson(config, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: requestTimeout(config),
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
        "id,title,handle,subtitle,description,material,metadata,*categories,*options,*options.values,*variants,*variants.options",
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

async function updateProduct(config, token, productId, body) {
  return requestJson(
    config,
    `${config.backend.replace(/\/$/, "")}/admin/products/${productId}`,
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

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function smartTitleCase(value) {
  const upperWords = new Map([
    ["lv", "LV"],
    ["tb", "TB"],
    ["mcm", "MCM"],
    ["pu", "PU"],
    ["pvc", "PVC"],
    ["1854", "1854"],
  ])

  return String(value || "")
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => {
      const normalized = word.toLowerCase()
      if (upperWords.has(normalized)) {
        return upperWords.get(normalized)
      }
      return word
        .split("-")
        .map((segment) => {
          const lowered = segment.toLowerCase()
          if (upperWords.has(lowered)) {
            return upperWords.get(lowered)
          }
          return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
        })
        .join("-")
    })
    .join(" ")
}

function normalizeSourceTitle(title) {
  return normalizeText(title)
    .replace(/\|.*$/u, "")
    .replace(/BrownJacquard/giu, "Brown Jacquard")
    .replace(/\bTB Seriess\b/giu, "TB Series")
    .replace(/\bwidht\b/giu, "width")
    .replace(/\bsuch as denim\b/giu, "denim-effect")
    .replace(/\bsuch denim\b/giu, "denim-effect")
    .replace(/\blook like denim\b/giu, "denim-effect")
    .replace(/\blike denim\s*\/\s*jean(?:s)?\b/giu, "denim-effect")
    .replace(/\bseem like denim(?:\/jeans?)?\b/giu, "denim-effect")
    .replace(/\bfabric such denim\b/giu, "denim-effect fabric")
    .replace(/\bbigger patterns\b/giu, "large pattern")
    .replace(/\bbig patterns\b/giu, "large pattern")
    .replace(/\bbig patterned\b/giu, "large pattern")
    .replace(/\s*,\s*/gu, ", ")
    .replace(/\s+/gu, " ")
    .trim()
}

function stripUseCaseTail(title) {
  return title
    .replace(
      /\s+for\s+(?:bags?|purses?|shoes?|upholstery|crafting|clothing|clothes|multipurpose|hats?|sewing|shirts?|scarves?|fashion)(?:[\s,/-]*(?:and|or)?[\s,/-]*(?:bags?|purses?|shoes?|upholstery|crafting|clothing|clothes|multipurpose|hats?|sewing|shirts?|scarves?|fashion))*[!,.]*$/iu,
      ""
    )
    .trim()
}

function colorRegex() {
  return new RegExp(
    `\\b(?:${COLOR_PHRASES.map((phrase) => escapeRegExp(phrase)).join("|")})\\b`,
    "giu"
  )
}

function extractColorValues(product) {
  const colorOption = (product.options || []).find(
    (option) => option.title?.toLowerCase() === "color"
  )

  return unique((colorOption?.values || []).map((value) => value.value?.trim()))
}

function extractPrimaryColor({ sourceTitle, product, metadata }) {
  const metadataTags = Array.isArray(metadata?.tags) ? metadata.tags : []
  const colorTag = metadataTags.find((tag) =>
    /^color-/iu.test(String(tag || ""))
  )

  if (colorTag) {
    const normalized = String(colorTag).replace(/^color-/iu, "").replace(/-/g, " ")
    return smartTitleCase(normalized)
  }

  const titleMatch = sourceTitle.match(colorRegex())
  if (titleMatch?.[0]) {
    return smartTitleCase(titleMatch[0])
  }

  const colorValues = extractColorValues(product)
  if (colorValues.length === 1) {
    return colorValues[0]
  }

  return null
}

function inferMaterial({ title, description, categorySlug }) {
  const titleHaystack = String(title || "").toLowerCase()
  const sourceHaystack = `${title} ${description} ${categorySlug}`.toLowerCase()

  if (/\bleather\b|\bsuede\b|\bempreinte\b/u.test(titleHaystack)) {
    return "Leather"
  }
  if (/\bvinyl\b/u.test(titleHaystack)) {
    return "Vinyl"
  }
  if (/\bjacquard\b/u.test(titleHaystack)) {
    return "Jacquard"
  }
  if (/\blining\b|\bliner\b/u.test(titleHaystack)) {
    return "Lining"
  }
  if (/\bcotton\b|\bpoplin\b/u.test(titleHaystack)) {
    return "Cotton"
  }
  if (/\bcanvas\b/u.test(titleHaystack)) {
    return "Canvas"
  }
  if (/\bdenim\b|\bjean\b|\bdenim-effect\b/u.test(titleHaystack)) {
    return "Denim"
  }
  if (categorySlug === "upholstery") {
    return "Upholstery Fabric"
  }
  if (/\bvinyl\b/u.test(sourceHaystack) || /\bpvc\b|\bpolyvinyl chloride\b/u.test(sourceHaystack)) {
    return "Vinyl"
  }
  if (/\bleather\b|\bsuede\b|\bempreinte\b/u.test(sourceHaystack)) {
    return "Leather"
  }
  if (categorySlug === "jacquard") {
    return "Jacquard"
  }
  if (categorySlug === "vinyl") {
    return "Vinyl"
  }
  if (categorySlug === "leather") {
    return "Leather"
  }
  if (categorySlug === "lining") {
    return "Lining"
  }
  if (categorySlug === "cotton") {
    return "Cotton"
  }
  if (categorySlug === "denim") {
    return "Denim"
  }

  return "Designer Textile"
}

function reorderBrandToFront(title, brand) {
  const matcher = new RegExp(escapeRegExp(brand), "iu")

  if (title.startsWith(brand) || !matcher.test(title)) {
    return title
  }

  return `${brand} ${normalizeText(title.replace(matcher, " "))}`.trim()
}

function normalizeTitlePatterns(title) {
  return normalizeText(title)
    .replace(/\bwith bigger patterns?\b/giu, " Large Pattern ")
    .replace(/\bwith big patterns?\b/giu, " Large Pattern ")
    .replace(/\bbigger patterns?\b/giu, " Large Pattern ")
    .replace(/\bbig patterns?\b/giu, " Large Pattern ")
    .replace(/\bbig patterned\b/giu, " Large Pattern ")
    .replace(/\bwith mini patterns?\b/giu, " Mini Pattern ")
    .replace(/\bwith tiny letters\b/giu, " Tiny Letters ")
    .replace(/\bwith velvet patterns?\b/giu, " Velvet Pattern ")
    .replace(/\bwith velvet letters\b/giu, " Velvet Letters ")
    .replace(/\bwith green ff pattern\b/giu, " FF Pattern ")
    .replace(/\bwith leaf pattern\b/giu, " Leaf Pattern ")
    .replace(/\bincluding tiger motifs\b/giu, " Tiger Motifs ")
    .replace(/\bwith orange leopard pattern\b/giu, " Leopard Pattern ")
    .replace(/\bwith leopard pattern\b/giu, " Leopard Pattern ")
    .replace(/\blook like denim\b/giu, " Denim-Effect ")
    .replace(/\bsuch as denim\b/giu, " Denim-Effect ")
    .replace(/\bsuch denim\b/giu, " Denim-Effect ")
    .replace(/\blike denim\s*\/\s*jean(?:s)?\b/giu, " Denim-Effect ")
    .replace(/\bseem like denim(?:\/jeans?)?\b/giu, " Denim-Effect ")
    .replace(/\bfabric such denim\b/giu, " Denim-Effect Fabric ")
    .replace(/\bnew tb series\b/giu, " TB Series ")
    .replace(/\bnew since 1854\b/giu, " Since 1854 ")
    .replace(/\bliner\b/giu, "Lining")
    .replace(/[!]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}

function stripUnsafeMultiColorFragments(title) {
  return normalizeText(title)
    .replace(/\bmulticolor\b/giu, " ")
    .replace(/\bon\s+(?:black|white)\s+background\b/giu, " ")
    .replace(/\b(?:and|or)\b(?=\s+(?:jacquard|vinyl|leather|cotton|lining|canvas|denim|fabric|material)\b)/giu, " ")
    .replace(/\b(?:and|or)\b\s*$/giu, " ")
}

function materialMatcher(material) {
  switch (material) {
    case "Canvas":
      return /\bcanvas fabric\b|\bcanvas\b/iu
    case "Cotton":
      return /\bcotton fabric\b|\bcotton\b|\bpoplin\b/iu
    case "Denim":
      return /\bdenim fabric\b|\bdenim-effect\b|\bdenim\b/iu
    case "Jacquard":
      return /\bjacquard fabric\b|\bjacquard\b/iu
    case "Leather":
      return /\bleather\b|\bsuede\b|\bempreinte\b/iu
    case "Lining":
      return /\blining fabric\b|\blining\b/iu
    case "Upholstery Fabric":
      return /\bupholstery fabric\b|\bupholstery\b/iu
    case "Vinyl":
      return /\bvinyl fabric\b|\bvinyl\b/iu
    default:
      return /\bdesigner textile\b/iu
  }
}

function compactTitle(title) {
  return normalizeText(title)
    .replace(/\bFabric Fabric\b/giu, "Fabric")
    .replace(/\bLeather Leather\b/giu, "Leather")
    .replace(/\bVinyl Vinyl\b/giu, "Vinyl")
    .replace(/\bPattern Pattern\b/giu, "Pattern")
    .replace(/\bMaterial\b/giu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}

function extractSafeDescriptors(title, material) {
  const source = String(title || "").toLowerCase()
  const descriptors = []
  const push = (pattern, label) => {
    if (pattern.test(source) && !descriptors.includes(label)) {
      descriptors.push(label)
    }
  }

  push(/\bembossed\b/u, "Embossed")
  push(/\breflective\b/u, "Reflective")
  push(/\blarge pattern\b|\bbig patterns?\b|\bbigger patterns?\b/u, "Large Pattern")
  push(/\bmini pattern(?:s)?\b/u, "Mini Pattern")
  push(/\btiny letters\b/u, "Tiny Letters")
  push(/\bvelvet pattern(?:s)?\b/u, "Velvet Pattern")
  push(/\bvelvet letters?\b/u, "Velvet Letters")
  push(/\bff pattern\b/u, "FF Pattern")
  push(/\btb series\b/u, "TB Series")
  push(/\bsince 1854\b/u, "Since 1854")
  push(/\bcheckered\b/u, "Checkered")
  push(/\bbaroque\b/u, "Baroque")
  push(/\btiger motifs?\b/u, "Tiger Motif")
  push(/\bleaf pattern\b/u, "Leaf Pattern")
  push(/\bmonogram\b/u, "Monogram")
  push(/\blogo print\b/u, "Logo Print")
  push(/\bwatercolor\b/u, "Watercolor")
  push(/\bleopard\b/u, "Leopard Pattern")
  push(/\bmickey\b|\bminnie\b/u, "Mickey & Minnie")
  push(/\bdenim-effect\b/u, "Denim-Effect")
  push(/\bclassic\b/u, "Classic")
  push(/\bhot press\b/u, "Hot Press")
  push(/\bempreinte\b/u, "Empreinte")
  push(/\bsuede\b/u, "Suede")
  push(/\bnylon\b/u, "Nylon")
  push(/\belastic\b/u, "Elastic")
  push(/\brainbow\b/u, "Rainbow")
  push(/\bpoplin\b/u, "Poplin")

  if (material === "Denim") {
    return descriptors.filter((descriptor) => descriptor !== "Denim-Effect")
  }

  return descriptors
}

function buildTitle({ item, product, material }) {
  const brand = BRAND_NAMES[item.brandSlug] || smartTitleCase(item.brandSlug)
  const sourceTitle = stripUseCaseTail(normalizeSourceTitle(item.title))
  const multiColor = extractColorValues(product).length > 1
  const suffix = MATERIAL_TITLE_SUFFIX[material] || MATERIAL_TITLE_SUFFIX["Designer Textile"]
  const titleForParsing = normalizeTitlePatterns(reorderBrandToFront(sourceTitle, brand))
  const primaryColor = multiColor
    ? null
    : extractPrimaryColor({
        sourceTitle: titleForParsing,
        product,
        metadata: product.metadata,
      })
  const descriptors = extractSafeDescriptors(titleForParsing, material)
  const parts = [brand]

  if (primaryColor && primaryColor.toLowerCase() !== "multicolor") {
    parts.push(primaryColor)
  }

  parts.push(...descriptors)

  const title = compactTitle([...parts, suffix].join(" "))

  if (materialMatcher(material).test(title)) {
    return title
  }

  return compactTitle(`${title} ${suffix}`)
}

function extractWidthLabel(description) {
  const source = normalizeText(description)
  const match =
    source.match(/width(?: of item)?(?: is|:)?\s*([^.;,]+(?:inches|inch|cm))/iu) ||
    source.match(/([0-9]+(?:\.[0-9]+)?\s*(?:inches|inch|cm))\s*(?:width|wide)/iu)

  if (!match?.[1]) {
    return null
  }

  return normalizeText(match[1])
}

function extractThicknessLabel(description) {
  const source = normalizeText(description)
  const match = source.match(/thickness(?: of item)?(?: is|:)?\s*([^.;]+)/iu)

  if (!match?.[1]) {
    return null
  }

  return normalizeText(match[1]).replace(/\b2-2-5\b/giu, "2-2.5")
}

function extractWeightLabel(description) {
  const source = normalizeText(description)
  const match =
    source.match(
      /([0-9]+(?:\s*[-–]\s*[0-9]+)?(?:\.[0-9]+)?\s*(?:g|gr)\s*(?:\/|per)\s*(?:square meter|meter square|sqm))/iu
    ) ||
    source.match(/([0-9]+(?:\.[0-9]+)?\s*(?:oz\/yd²|oz\/yd2))/iu)

  if (!match?.[1]) {
    return null
  }

  return normalizeText(match[1])
    .replace(/\bgr\b/giu, "g")
    .replace(/g\s*\/\s*meter square/giu, "g per square meter")
    .replace(/g\s*\/\s*square meter/giu, "g per square meter")
}

function extractCareLabel(description) {
  const source = normalizeText(description).toLowerCase()

  if (source.includes("cold machine wash is possible")) {
    return "Cold machine wash is possible."
  }

  if (source.includes("machine wash is possible")) {
    return "Cold machine wash is possible."
  }

  if (source.includes("dry clean")) {
    return "Dry clean recommended."
  }

  return null
}

function extractCompositionLabel(description) {
  const source = normalizeText(description)
    .replace(/%\s+/g, "% ")
    .replace(/\bback side textile\s*\(felt or fabric\)/giu, "backing")
    .replace(/\bplain weave fabric\s*\(bottom layer\)/giu, "plain-weave backing")
    .replace(/\bpolyvinyl chloride\b/giu, "polyvinyl chloride")

  const matches = [
    ...source.matchAll(
      /(\d+\s*%\s*[^%]+?)(?=(?:\d+\s*%)|(?:if you order)|(?:width)|(?:thickness)|(?:\d+(?:\s*[-–]\s*\d+)?\s*(?:g|gr)\s*(?:\/|per))|(?:machine wash)|(?:dry clean)|$)/giu
    ),
  ]

  const cleaned = unique(
    matches
      .map((match) =>
        normalizeText(match[1])
          .replace(/\s*\(\s*/g, " (")
          .replace(/\s*\)\s*/g, ") ")
          .replace(/\s+/g, " ")
          .replace(/,\s*$/g, "")
          .trim()
      )
      .map((chunk) =>
        chunk
          .replace(/\bpolyester backing\b/giu, "polyester backing")
          .replace(/\bfront layer\b/giu, "front layer")
          .replace(/\bbottom layer\b/giu, "bottom layer")
      )
  )

  if (!cleaned.length) {
    if (/\bpolyester material\b/iu.test(source)) {
      return "Polyester"
    }

    if (/\b100%\s*cotton\b/iu.test(source)) {
      const cottonVariant = source.match(/100%\s*cotton\s*([a-z-]+)?/iu)
      const suffix = cottonVariant?.[1] ? ` ${cottonVariant[1].toLowerCase()}` : ""
      return `100% cotton${suffix}`.trim()
    }

    return null
  }

  return cleaned.join(", ")
}

function getUseCaseLabel(material) {
  return USE_CASE_LABELS[material] || USE_CASE_LABELS["Designer Textile"]
}

function getSellingUnitLabel(product) {
  const sizeOption = (product.options || []).find(
    (option) => option.title?.toLowerCase() === "size"
  )
  const sizeValue = sizeOption?.values?.[0]?.value?.trim()

  if (sizeValue) {
    return sizeValue
  }

  return "1 yard"
}

function getColorwayCount(product) {
  const colorValues = extractColorValues(product)
  return colorValues.length || 1
}

function cleanSourceDescription(description) {
  return normalizeText(description)
    .replace(/\bcontinious\b/giu, "continuous")
    .replace(/\buncutten\b/giu, "uncut")
    .replace(/\bweawen\b/giu, "woven")
    .replace(/\borde\b/giu, "order")
    .replace(/\bwidht\b/giu, "width")
    .replace(/%\s*(\d+)/gu, "$1%")
    .replace(/(\d+)\s*%/gu, "$1%")
    .replace(/\s+([,.;!?])/gu, "$1")
    .trim()
}

function buildEditorialSummary({ title, material, width, colorwayCount, useCase, sellingUnit }) {
  const sellingUnitPhrase =
    sellingUnit.toLowerCase() === "1 yard"
      ? "yard"
      : sellingUnit.toLowerCase()
  const parts = [
    `${title} is offered by the ${sellingUnitPhrase}.`,
    width ? `Approx. ${width} wide.` : "Sold in easy-to-plan yard increments.",
    colorwayCount > 1 ? `Available in ${colorwayCount} colorways.` : null,
    smartTitleCase(
      useCase.replace(/^Best for\s*/iu, "").replace(/\.$/u, "")
    ) + ".",
  ]

  return parts.filter(Boolean).join(" ")
}

function buildSeoDescription({
  title,
  width,
  colorwayCount,
  material,
  sellingUnit,
  useCase,
}) {
  const priceNote = /(?:Leather|Vinyl|Upholstery Fabric)/u.test(material)
    ? "USD 45 per yard."
    : "USD 35 per yard."
  const unitNote =
    sellingUnit.toLowerCase() === "1 yard"
      ? "Sold by the yard."
      : `Sold in ${sellingUnit.toLowerCase()} units.`

  return [
    `${title}.`,
    width ? `${width} wide.` : null,
    unitNote,
    colorwayCount > 1 ? `${colorwayCount} colorways available.` : null,
    useCase,
    priceNote,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
}

function buildDescription({
  title,
  subtitle,
  width,
  thickness,
  composition,
  weight,
  care,
  colorwayCount,
  useCase,
}) {
  const sentences = [
    `${title} is a curated designer archive textile offered by the yard.`,
    colorwayCount > 1 ? `This family is available in ${colorwayCount} colorways.` : null,
    width ? `Width of item is ${width}.` : null,
    thickness ? `Thickness of item is ${thickness}.` : null,
    composition ? `Composition: ${composition}.` : null,
    weight ? `Weight: ${weight}.` : null,
    care,
    "If you order more than a yard, multiple yards are usually prepared as one continuous cut when the roll allows.",
    `Recommended use: ${useCase.replace(/^Best for\s*/iu, "").replace(/\.$/u, "")}.`,
  ]

  return sentences.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

function buildSubtitle({ material, sellingUnit, colorwayCount }) {
  const materialLabel =
    MATERIAL_DESCRIPTION_LABEL[material] ||
    MATERIAL_DESCRIPTION_LABEL["Designer Textile"]
  const sellingUnitPhrase =
    sellingUnit.toLowerCase() === "1 yard"
      ? "yard"
      : sellingUnit.toLowerCase()

  const pieces = [`Designer ${materialLabel} sold by the ${sellingUnitPhrase}.`]

  if (colorwayCount > 1) {
    pieces.push(`Available in ${colorwayCount} colorways.`)
  }

  return pieces.join(" ")
}

function buildCopyPayload(item, product) {
  const sourceDescription = cleanSourceDescription(item.description || "")
  const material = inferMaterial({
    title: item.title,
    description: sourceDescription,
    categorySlug: item.categorySlug,
  })
  const colorwayCount = getColorwayCount(product)
  const sellingUnit = getSellingUnitLabel(product)
  const title = buildTitle({ item, product, material })
  const width = extractWidthLabel(sourceDescription)
  const thickness = extractThicknessLabel(sourceDescription)
  const composition = extractCompositionLabel(sourceDescription)
  const weight = extractWeightLabel(sourceDescription)
  const care = extractCareLabel(sourceDescription)
  const useCase = getUseCaseLabel(material)
  const subtitle = buildSubtitle({ material, sellingUnit, colorwayCount })
  const editorialSummary = buildEditorialSummary({
    title,
    material,
    width,
    colorwayCount,
    useCase,
    sellingUnit,
  })
  const seoTitle = `${title} by the Yard`
  const seoDescription = buildSeoDescription({
    title,
    width,
    colorwayCount,
    material,
    sellingUnit,
    useCase,
  })
  const description = buildDescription({
    title,
    subtitle,
    width,
    thickness,
    composition,
    weight,
    care,
    colorwayCount,
    useCase,
  })

  return {
    title,
    subtitle,
    description,
    material,
    metadata: {
      ...(product.metadata || {}),
      copy_standard_version: "fabric-copy-2026-03-v1",
      source_title_original: item.title,
      source_description_original: sourceDescription,
      width_label: width,
      thickness_label: thickness,
      composition_label: composition,
      weight_label: weight,
      care_label: care,
      use_case_label: useCase,
      material_label: material,
      selling_unit: sellingUnit,
      continuous_yardage_note:
        "Multiple yards are usually prepared as one continuous cut whenever the roll allows.",
      colorway_count: colorwayCount,
      editorial_summary: editorialSummary,
      seo_title: seoTitle,
      seo_description: seoDescription,
    },
  }
}

function productBelongsToFabricSite(product) {
  return product.metadata?.site_slug === "atelier-fabrics"
}

async function main() {
  const config = parseArgs(process.argv.slice(2))

  if (!config.backend || (!config.token && (!config.email || !config.password))) {
    usage()
    process.exit(1)
  }

  const sourceItems = JSON.parse(readFileSync(resolve(config.catalog), "utf8"))
  const sourceBySlug = new Map(sourceItems.map((item) => [item.slug, item]))
  const token = await getToken(config)
  const products = await listProducts(config, token)

  const summary = {
    mode: config.apply ? "apply" : "dry-run",
    totalProducts: 0,
    updatedProducts: 0,
    skippedProducts: 0,
    errors: [],
    samples: [],
  }

  for (const product of products) {
    if (!productBelongsToFabricSite(product)) {
      continue
    }

    const item = sourceBySlug.get(product.handle)
    if (!item) {
      continue
    }

    if (config.handles.size && !config.handles.has(product.handle)) {
      continue
    }

    summary.totalProducts += 1

    const payload = buildCopyPayload(item, product)
    summary.samples.push({
      handle: product.handle,
      beforeTitle: product.title,
      afterTitle: payload.title,
      material: payload.material,
      width: payload.metadata.width_label,
      composition: payload.metadata.composition_label,
    })

    if (!config.apply) {
      continue
    }

    try {
      await updateProduct(config, token, product.id, payload)
      summary.updatedProducts += 1
    } catch (error) {
      summary.errors.push({
        handle: product.handle,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  summary.skippedProducts = summary.totalProducts - summary.updatedProducts - summary.errors.length

  if (config.report) {
    writeFileSync(resolve(config.report), JSON.stringify(summary, null, 2))
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
