import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { buildSiteManifest } from "../../../lib/site-builder";
import { SiteBuilderInput, siteBuilderExampleInput } from "../../../lib/site-builder-schema";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  res.status(200).json({
    version: 1,
    route: "/admin/site-builder",
    authentication: "Admin session, bearer token, or secret API key",
    description:
      "Builds the Medusa catalog contract for an AI-generated storefront and returns the frontend env manifest.",
    example_input: siteBuilderExampleInput,
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
