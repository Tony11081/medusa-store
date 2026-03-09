import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { buildSiteManifest } from "../../../lib/site-builder";
import {
  SiteBuilderInput,
  siteBuilderExampleInput,
  siteControlPlanePatchExampleInput,
} from "../../../lib/site-builder-schema";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const baseUrl = host ? `${protocol}://${host}` : null;

  res.status(200).json({
    version: 2,
    privilege: "full-admin",
    route: "/admin/site-builder",
    authentication: {
      recommended: "Authorization: Basic <secret-api-key>",
      supported: [
        "Admin session",
        "Bearer token",
        "Secret API key",
      ],
    },
    description:
      "High-privilege orchestration endpoint for AI-driven store creation and control-plane updates. It creates or reuses channels, keys, categories, and products, then returns the persisted site manifest.",
    admin_api: {
      base_url: baseUrl,
      site_builder_route: baseUrl ? `${baseUrl}/admin/site-builder` : null,
      site_list_route: baseUrl
        ? `${baseUrl}/admin/site-builder/sites`
        : null,
      site_detail_route_template: baseUrl
        ? `${baseUrl}/admin/site-builder/sites/:siteRef`
        : null,
      capabilities: [
        "create-or-reuse sales channels",
        "create publishable API keys",
        "create-or-reuse product categories",
        "create-or-reuse products",
        "persist site control-plane metadata",
        "list managed sites",
        "retrieve a managed site by slug, domain, or sales channel id",
        "update domain, deployment, payments, and operations state",
        "return frontend env manifest and launch readiness",
      ],
    },
    cli: {
      create_secret_key:
        "npm run api-key:create -- title=AI-SITE-BUILDER type=secret",
      build_site:
        "npm run site:build -- /path/to/site-config.json",
    },
    example_input: siteBuilderExampleInput,
    patch_example_input: siteControlPlanePatchExampleInput,
  });
}

export async function POST(
  req: AuthenticatedMedusaRequest<SiteBuilderInput>,
  res: MedusaResponse
) {
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const backendUrl = host ? `${protocol}://${host}` : undefined;

  const manifest = await buildSiteManifest(req.scope, req.validatedBody, {
    backendUrl,
    createdBy: req.auth_context.actor_id,
  });

  res.status(200).json(manifest);
}
