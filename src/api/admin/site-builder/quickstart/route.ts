import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { buildSiteFromQuickstart } from "../../../../lib/site-quickstart";
import {
  SiteQuickstartInput,
  siteQuickstartExampleInput,
} from "../../../../lib/site-builder-schema";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const baseUrl = host ? `${protocol}://${host}` : null;

  res.status(200).json({
    version: 1,
    privilege: "full-admin",
    route: "/admin/site-builder/quickstart",
    description:
      "Minimal-input site creation endpoint. Provide brand name, website intro, and a product document. The backend infers theme direction, page prompts, categories, and products, then delegates to /admin/site-builder.",
    admin_api: {
      base_url: baseUrl,
      quickstart_route: baseUrl
        ? `${baseUrl}/admin/site-builder/quickstart`
        : null,
      site_builder_route: baseUrl ? `${baseUrl}/admin/site-builder` : null,
      authentication: "Authorization: Basic <secret-api-key>",
    },
    required_inputs: [
      "brand_name",
      "website_intro",
      "product_document",
    ],
    notes: [
      "product_document can be a raw string, markdown, JSON, or structured categories/products.",
      "domain is optional here because domain provisioning can happen through an external skill or provider workflow.",
      "This route does not replace /admin/site-builder. It synthesizes a standard site-builder payload and returns it alongside the persisted manifest.",
    ],
    example_input: siteQuickstartExampleInput,
  });
}

export async function POST(
  req: AuthenticatedMedusaRequest<SiteQuickstartInput>,
  res: MedusaResponse
) {
  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const backendUrl = host ? `${protocol}://${host}` : undefined;

  const result = await buildSiteFromQuickstart(req.scope, req.validatedBody, {
    backendUrl,
    createdBy: req.auth_context.actor_id,
  });

  res.status(200).json(result);
}
