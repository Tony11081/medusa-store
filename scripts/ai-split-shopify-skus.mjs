#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { homedir } from "node:os"

const DEFAULT_BASE_URL = "https://v3.codesome.cn/v1/messages"
const DEFAULT_MODEL = "claude-sonnet-4-20250514"
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_CONCURRENCY = 1
const DEFAULT_TIMEOUT_MS = 60000
const DEFAULT_CODESOME_KEY_NAMES = [
  "CODESOME_KEY",
  "BAOYUE_CODESOME_KEY",
  "LIULIANG_CODESOME_KEY",
]

const SYSTEM_PROMPT = `You are a Shopify product data specialist. Your job is to analyze raw product data and intelligently split single-SKU listings into proper multi-variant products.

## Core Rules

1. EXTRACT color/style variants from image URLs and product titles
2. IGNORE non-product images (logos, banners, watermarks — identifiable by filenames containing "logo", "banner", "WOUWWW", "thumbs", or generic brand names)
3. DEDUPLICATE: if multiple images suggest the same color, merge them under one variant
4. PRESERVE all original product info (description, vendor, tags, etc.)
5. OUTPUT strictly valid JSON — no markdown fences, no commentary

## Color Extraction Priority

1. Image filename (highest signal): "navy-blue-gucci-fabric.webp" → "Navy Blue"
2. Product title: "GJ06 Jacquard Fabric Brown" → "Brown" (this is the DEFAULT variant)
3. If a color cannot be determined from filename, label it as "Style {N}" (e.g., "Style 1")

## Variant Construction Rules

- The color mentioned in the TITLE is the PRIMARY variant (listed first)
- Each distinct color = one new variant row
- All variants share the same: Handle, Title base, Body HTML, Vendor, Tags, Price
- Option1 = Size (keep original), Option2 = Color (new)
- Variant SKU format: {ORIGINAL_SKU}-{COLOR_CODE}
  - COLOR_CODE: uppercase abbreviation, e.g., BRN (Brown), NVY (Navy Blue), PNK (Pink), IVR (Ivory), RED (Red), GRN (Green), BLK (Black), WHT (White), GLD (Gold), SLV (Silver), BLU (Blue), GRY (Grey), MTL (Metallic)
- Each variant gets its own Image Src (the corresponding color image)

## Output JSON Schema

{
  "handle": "string",
  "title_base": "string (remove color from original title if present)",
  "variants": [
    {
      "color": "string",
      "color_code": "string (3-letter uppercase)",
      "sku": "string",
      "image_urls": ["string"],
      "is_primary": true
    }
  ],
  "filtered_images": [
    {
      "url": "string",
      "reason": "logo|unidentifiable|duplicate"
    }
  ]
}`

const COLOR_CODE_MAP = new Map([
  ["black", "BLK"],
  ["white", "WHT"],
  ["brown", "BRN"],
  ["navy blue", "NVY"],
  ["navy", "NVY"],
  ["pink", "PNK"],
  ["ivory", "IVR"],
  ["red", "RED"],
  ["green", "GRN"],
  ["gold", "GLD"],
  ["silver", "SLV"],
  ["blue", "BLU"],
  ["gray", "GRY"],
  ["grey", "GRY"],
  ["champagne", "CHM"],
  ["beige", "BEI"],
  ["cream", "CRM"],
  ["orange", "ORG"],
  ["purple", "PRP"],
  ["yellow", "YLW"],
  ["tan", "TAN"],
  ["multicolor", "MLT"],
  ["metallic", "MTL"],
])

const FIRST_ROW_ONLY_FIELDS = new Set([
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Status",
])

function parseArgs(argv) {
  const config = {
    input: "",
    output: "",
    report: "",
    rawDir: "",
    baseUrl: process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.CODESOME_KEY || "",
    apiKeys: [],
    codesomeKeyName: "",
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    maxTokens: Number.parseInt(process.env.ANTHROPIC_MAX_TOKENS || "", 10) || DEFAULT_MAX_TOKENS,
    concurrency: Number.parseInt(process.env.AI_SPLIT_CONCURRENCY || "", 10) || DEFAULT_CONCURRENCY,
    timeoutMs: Number.parseInt(process.env.AI_SPLIT_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS,
    limit: 0,
    handles: new Set(),
    skipExistingOption2: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--input") {
      config.input = next || config.input
      index += 1
      continue
    }
    if (arg === "--output") {
      config.output = next || config.output
      index += 1
      continue
    }
    if (arg === "--report") {
      config.report = next || config.report
      index += 1
      continue
    }
    if (arg === "--raw-dir") {
      config.rawDir = next || config.rawDir
      index += 1
      continue
    }
    if (arg === "--base-url") {
      config.baseUrl = next || config.baseUrl
      index += 1
      continue
    }
    if (arg === "--api-key") {
      config.apiKey = next || config.apiKey
      index += 1
      continue
    }
    if (arg === "--codesome-key") {
      config.codesomeKeyName = next || config.codesomeKeyName
      index += 1
      continue
    }
    if (arg === "--model") {
      config.model = next || config.model
      index += 1
      continue
    }
    if (arg === "--max-tokens") {
      config.maxTokens = Number.parseInt(next || "", 10) || config.maxTokens
      index += 1
      continue
    }
    if (arg === "--concurrency") {
      config.concurrency = Number.parseInt(next || "", 10) || config.concurrency
      index += 1
      continue
    }
    if (arg === "--timeout-ms") {
      config.timeoutMs = Number.parseInt(next || "", 10) || config.timeoutMs
      index += 1
      continue
    }
    if (arg === "--limit") {
      config.limit = Number.parseInt(next || "", 10) || 0
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
    if (arg === "--include-existing-option2") {
      config.skipExistingOption2 = false
      continue
    }
  }

  if (!config.input) {
    config.input = "/Users/chengyadong/Downloads/wouwww_shopify_20260308.csv"
  }
  if (!config.output) {
    config.output = config.input.replace(/\.csv$/i, ".split.csv")
  }
  if (!config.report) {
    config.report = config.output.replace(/\.csv$/i, ".report.json")
  }

  return config
}

function usage() {
  console.error(
    [
      "Usage:",
      "  npm run shopify:split-skus:ai -- --input /path/products.csv --output /path/products.split.csv",
      "Options:",
      "  --report /path/report.json",
      "  --raw-dir /path/raw-json",
      "  --handle gj06 or --handles gj06,gj10",
      "  --codesome-key BAOYUE_CODESOME_KEY",
      "  --limit 10",
      "  --concurrency 3",
    ].join("\n")
  )
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8")
    const values = {}
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const separator = trimmed.indexOf("=")
      if (separator === -1) continue
      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim()
      values[key] = value
    }
    return values
  } catch {
    return {}
  }
}

function resolveCodesomeApiKeys(config) {
  const keys = []

  if (config.apiKey) {
    keys.push(config.apiKey)
  }

  const envFiles = [
    resolve(homedir(), ".openclaw/codesome.env"),
    resolve(homedir(), ".openclaw/anthropic.env"),
  ]

  const envValues = Object.assign({}, ...envFiles.map(loadEnvFile))

  if (config.codesomeKeyName) {
    const explicit = process.env[config.codesomeKeyName] || envValues[config.codesomeKeyName] || ""
    return explicit ? [explicit] : []
  }

  for (const keyName of DEFAULT_CODESOME_KEY_NAMES) {
    if (process.env[keyName]) keys.push(process.env[keyName])
    if (envValues[keyName]) keys.push(envValues[keyName])
  }

  return [...new Set(keys.filter(Boolean))]
}

function parseCsv(csvText) {
  const rows = []
  let current = ""
  let row = []
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]
    const next = csvText[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      row.push(current)
      current = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1
      }
      row.push(current)
      rows.push(row)
      row = []
      current = ""
      continue
    }

    current += char
  }

  if (current.length || row.length) {
    row.push(current)
    rows.push(row)
  }

  if (!rows.length) return { headers: [], records: [] }

  const headers = rows[0]
  const records = rows.slice(1).map((values) => {
    const record = {}
    headers.forEach((header, index) => {
      record[header] = values[index] ?? ""
    })
    return record
  })

  return { headers, records }
}

function escapeCsvValue(value) {
  const stringValue = value == null ? "" : String(value)
  if (/[",\n\r]/u.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }
  return stringValue
}

function stringifyCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","))
  }
  return `${lines.join("\r\n")}\r\n`
}

function groupShopifyRecords(records) {
  const grouped = new Map()

  for (const row of records) {
    const handle = String(row.Handle || "").trim()
    if (!handle) continue

    if (!grouped.has(handle)) {
      grouped.set(handle, {
        handle,
        rows: [],
        main: null,
        images: [],
      })
    }

    const group = grouped.get(handle)
    group.rows.push(row)

    if (!group.main && String(row.Title || "").trim()) {
      group.main = row
    }

    const imageUrl = String(row["Image Src"] || "").trim()
    if (imageUrl) {
      group.images.push({
        url: imageUrl,
        position: String(row["Image Position"] || "").trim(),
      })
    }
  }

  return [...grouped.values()].filter((group) => group.main)
}

function truncateDescription(value, maxLength = 200) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maxLength)
}

function buildUserPrompt(group) {
  const main = group.main
  return [
    "Analyze this product and split into color variants:",
    "",
    `HANDLE: ${group.handle}`,
    `TITLE: ${main.Title || ""}`,
    `DESCRIPTION: ${truncateDescription(main["Body (HTML)"])}`,
    `CURRENT SKU: ${main["Variant SKU"] || ""}`,
    `CURRENT PRICE: ${main["Variant Price"] || ""}`,
    "",
    "IMAGES:",
    ...(group.images.length
      ? group.images.map((image, index) => `${index + 1}. ${image.url}`)
      : ["1."]),
    "",
    "Return JSON only.",
  ].join("\n")
}

async function requestWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function callCodesome(config, prompt, apiKey) {
  const response = await requestWithTimeout(
    config.baseUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    },
    config.timeoutMs
  )

  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof body === "string" ? body : JSON.stringify(body)}`)
  }

  const content = Array.isArray(body?.content) ? body.content : []
  const outputText = content
    .filter((item) => item?.type === "text" || typeof item?.text === "string")
    .map((item) => item.text || "")
    .join("\n")
    .trim()

  if (!outputText) {
    throw new Error("Codesome returned empty content")
  }

  return {
    raw: body,
    text: outputText,
  }
}

function cleanJsonText(value) {
  return value.replace(/```json\s*/giu, "").replace(/```\s*/gu, "").trim()
}

function buildColorCode(color) {
  const normalized = color.toLowerCase().trim()
  if (COLOR_CODE_MAP.has(normalized)) {
    return COLOR_CODE_MAP.get(normalized)
  }

  const orderedMatches = [...COLOR_CODE_MAP.entries()].sort((left, right) => right[0].length - left[0].length)
  for (const [token, code] of orderedMatches) {
    if (normalized.includes(token)) {
      return code
    }
  }

  const letters = normalized
    .replace(/[^a-z ]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() || "")
    .join("")

  return (letters || "STY").slice(0, 3).padEnd(3, "X")
}

function dedupeBy(values, keyFn) {
  const seen = new Set()
  const result = []

  for (const value of values) {
    const key = keyFn(value)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }

  return result
}

function normalizeTitleBase(titleBase, originalTitle) {
  if (titleBase && String(titleBase).trim()) {
    return String(titleBase).trim()
  }
  return String(originalTitle || "").trim()
}

function normalizeVariant(variant, index, group, primaryColor, usedSkus) {
  const originalSku = String(group.main["Variant SKU"] || group.handle).trim()
  const color = String(variant?.color || `Style ${index + 1}`).trim()
  const colorCode = String(variant?.color_code || buildColorCode(color)).trim().toUpperCase().slice(0, 3)
  let sku = String(variant?.sku || `${originalSku}-${colorCode}`).trim()

  while (usedSkus.has(sku)) {
    sku = `${originalSku}-${colorCode}${usedSkus.size}`
  }
  usedSkus.add(sku)

  const imageUrls = dedupeBy(
    Array.isArray(variant?.image_urls) ? variant.image_urls.map((url) => String(url || "").trim()).filter(Boolean) : [],
    (value) => value.toLowerCase()
  )

  return {
    color,
    color_code: colorCode,
    sku,
    image_urls: imageUrls,
    is_primary: Boolean(variant?.is_primary) || color.toLowerCase() === primaryColor.toLowerCase(),
  }
}

function normalizeAiResult(group, parsed) {
  const titleBase = normalizeTitleBase(parsed?.title_base, group.main.Title)
  const primaryFromTitle = extractColorFromText(group.main.Title) || ""
  const filteredImages = Array.isArray(parsed?.filtered_images)
    ? parsed.filtered_images
        .map((image) => ({
          url: String(image?.url || "").trim(),
          reason: String(image?.reason || "").trim() || "unidentifiable",
        }))
        .filter((image) => image.url)
    : []

  const usedSkus = new Set()
  let variants = Array.isArray(parsed?.variants)
    ? parsed.variants.map((variant, index) =>
        normalizeVariant(variant, index, group, primaryFromTitle, usedSkus)
      )
    : []

  variants = dedupeBy(variants, (variant) => variant.color.toLowerCase())

  if (!variants.length) {
    throw new Error("AI returned no variants")
  }

  let primaryIndex = variants.findIndex((variant) => variant.is_primary)
  if (primaryIndex === -1 && primaryFromTitle) {
    primaryIndex = variants.findIndex((variant) => variant.color.toLowerCase() === primaryFromTitle.toLowerCase())
  }
  if (primaryIndex === -1) {
    primaryIndex = 0
  }

  variants = variants.map((variant, index) => ({
    ...variant,
    is_primary: index === primaryIndex,
  }))

  if (primaryIndex > 0) {
    const [primary] = variants.splice(primaryIndex, 1)
    variants.unshift(primary)
  }

  return {
    handle: String(parsed?.handle || group.handle).trim() || group.handle,
    title_base: titleBase,
    variants,
    filtered_images: filteredImages,
  }
}

function extractColorFromText(value) {
  const source = String(value || "").toLowerCase()
  const ordered = [...COLOR_CODE_MAP.keys()].sort((left, right) => right.length - left.length)
  for (const color of ordered) {
    if (source.includes(color)) {
      return color
        .split(/\s+/u)
        .map((token) => token[0].toUpperCase() + token.slice(1))
        .join(" ")
    }
  }
  return ""
}

function validateAiResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("AI result is not an object")
  }
  if (!Array.isArray(result.variants) || result.variants.length === 0) {
    throw new Error("AI result has no variants")
  }
  if (!result.variants.some((variant) => variant.is_primary)) {
    throw new Error("AI result has no primary variant")
  }

  const skus = result.variants.map((variant) => variant.sku)
  if (new Set(skus).size !== skus.length) {
    throw new Error("AI result has duplicate SKUs")
  }
}

function buildOutputHeaders(inputHeaders) {
  const extras = ["Option2 Name", "Option2 Value"]
  return [...new Set([...inputHeaders, ...extras])]
}

function toShopifyRows(result, group, headers) {
  const main = group.main
  const option1Name = String(main["Option1 Name"] || "Size").trim() || "Size"
  const option1Value = String(main["Option1 Value"] || "1 Yard").trim() || "1 Yard"
  const outputRows = []

  result.variants.forEach((variant, index) => {
    const row = Object.fromEntries(headers.map((header) => [header, ""]))

    for (const [key, value] of Object.entries(main)) {
      if (!headers.includes(key)) continue
      if (FIRST_ROW_ONLY_FIELDS.has(key) && index > 0) continue
      row[key] = value
    }

    row.Handle = result.handle
    row.Title = index === 0 ? result.title_base : ""
    row["Body (HTML)"] = index === 0 ? main["Body (HTML)"] : ""
    row.Vendor = index === 0 ? main.Vendor : ""
    row.Type = index === 0 ? main.Type : ""
    row.Tags = index === 0 ? main.Tags : ""
    row.Published = index === 0 ? main.Published : ""
    row.Status = index === 0 ? (main.Status || "active") : ""
    row["Option1 Name"] = option1Name
    row["Option1 Value"] = option1Value
    row["Option2 Name"] = "Color"
    row["Option2 Value"] = variant.color
    row["Variant SKU"] = variant.sku
    row["Variant Price"] = main["Variant Price"]
    row["Variant Requires Shipping"] = main["Variant Requires Shipping"] || "TRUE"
    row["Variant Taxable"] = main["Variant Taxable"] || "TRUE"
    row["Image Src"] = variant.image_urls[0] || ""
    row["Image Position"] = String(index + 1)

    outputRows.push(row)
  })

  return outputRows
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0

  async function next() {
    const index = cursor
    cursor += 1
    if (index >= items.length) return
    results[index] = await worker(items[index], index)
    await next()
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next())
  await Promise.all(workers)
  return results
}

async function processGroup(config, group) {
  const prompt = buildUserPrompt(group)
  let lastError = null
  const apiKeys = config.apiKeys.length ? config.apiKeys : [config.apiKey]
  const attemptCount = Math.max(3, apiKeys.length)

  for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
    try {
      const apiKey = apiKeys[(attempt - 1) % apiKeys.length]
      const response = await callCodesome(config, prompt, apiKey)
      const parsed = JSON.parse(cleanJsonText(response.text))
      const normalized = normalizeAiResult(group, parsed)
      validateAiResult(normalized)

      return {
        handle: group.handle,
        ok: true,
        prompt,
        raw: response.raw,
        result: normalized,
      }
    } catch (error) {
      lastError = error
      if (attempt < attemptCount) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
      }
    }
  }

  return {
    handle: group.handle,
    ok: false,
    prompt,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }
}

function selectGroups(config, groups) {
  return groups.filter((group) => {
    const main = group.main
    if (!main) return false
    if (config.handles.size && !config.handles.has(group.handle)) return false
    if (config.skipExistingOption2 && String(main["Option2 Name"] || "").trim()) return false
    return true
  }).slice(0, config.limit || undefined)
}

async function main() {
  const config = parseArgs(process.argv.slice(2))
  if (!config.input) {
    usage()
    process.exit(1)
  }

  config.apiKeys = resolveCodesomeApiKeys(config)
  config.apiKey = config.apiKeys[0] || ""
  if (!config.apiKey) {
    throw new Error("Missing codesome API key. Set CODESOME_KEY or ~/.openclaw/codesome.env")
  }

  const csvPath = resolve(config.input)
  const outputPath = resolve(config.output)
  const reportPath = resolve(config.report)
  const rawDir = config.rawDir ? resolve(config.rawDir) : ""

  const csvText = readFileSync(csvPath, "utf8")
  const { headers, records } = parseCsv(csvText)
  const groups = groupShopifyRecords(records)
  const targets = selectGroups(config, groups)

  if (!targets.length) {
    throw new Error("No eligible products found in CSV")
  }

  console.log(`Processing ${targets.length} product(s) with ${config.model}`)
  const processed = await runPool(targets, config.concurrency, async (group, index) => {
    console.log(`[${index + 1}/${targets.length}] ${group.handle}`)
    const result = await processGroup(config, group)

    if (rawDir && result.ok) {
      const rawPath = resolve(rawDir, `${group.handle}.json`)
      ensureDir(rawPath)
      writeFileSync(
        rawPath,
        JSON.stringify(
          {
            handle: group.handle,
            prompt: result.prompt,
            raw: result.raw,
            normalized: result.result,
          },
          null,
          2
        )
      )
    }

    return result
  })

  const resultsByHandle = new Map(processed.filter((item) => item.ok).map((item) => [item.handle, item.result]))
  const outputHeaders = buildOutputHeaders(headers)
  const outputRows = []

  for (const group of groups) {
    const aiResult = resultsByHandle.get(group.handle)
    if (aiResult) {
      outputRows.push(...toShopifyRows(aiResult, group, outputHeaders))
      continue
    }
    outputRows.push(...group.rows.map((row) => {
      const outputRow = Object.fromEntries(outputHeaders.map((header) => [header, row[header] ?? ""]))
      return outputRow
    }))
  }

  ensureDir(outputPath)
  ensureDir(reportPath)
  writeFileSync(outputPath, stringifyCsv(outputHeaders, outputRows))

  const report = {
    input: csvPath,
    output: outputPath,
    processed: processed.length,
    successCount: processed.filter((item) => item.ok).length,
    failureCount: processed.filter((item) => !item.ok).length,
    failures: processed.filter((item) => !item.ok).map((item) => ({
      handle: item.handle,
      error: item.error,
    })),
    results: processed
      .filter((item) => item.ok)
      .map((item) => ({
        handle: item.handle,
        variantCount: item.result.variants.length,
        variants: item.result.variants,
        filtered_images: item.result.filtered_images,
      })),
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log(
    JSON.stringify(
      {
        output: outputPath,
        report: reportPath,
        processed: report.processed,
        successCount: report.successCount,
        failureCount: report.failureCount,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
