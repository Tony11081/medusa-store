import { MedusaContainer } from "@medusajs/framework/types";
import { listSiteManifests } from "./site-builder";

type CapabilityState = "ready" | "partial" | "missing" | "external";

export type SitePlatformCapabilities = {
  version: number;
  privilege: "full-admin";
  platform: "ai-commerce-control-plane";
  admin_api: {
    base_url: string | null;
    site_builder_route: string | null;
    quickstart_route: string | null;
    site_list_route: string | null;
    platform_route: string | null;
    authentication: "Authorization: Basic <secret-api-key>";
  };
  current_state: {
    managed_sites_count: number;
    stripe: {
      provider_installed: boolean;
      env_configured: boolean;
      webhook_path: string | null;
    };
    capabilities: {
      commerce_core: CapabilityState;
      site_control_plane: CapabilityState;
      theme_generation: CapabilityState;
      storefront_deploy_automation: CapabilityState;
      launch_workflow: CapabilityState;
      domain_automation: CapabilityState;
      payment_activation: CapabilityState;
      operations_automation: CapabilityState;
      app_ecosystem: CapabilityState;
    };
  };
  shopify_parity: {
    commerce_core: {
      status: CapabilityState;
      notes: string;
    };
    site_control_plane: {
      status: CapabilityState;
      notes: string;
    };
    theme_generation: {
      status: CapabilityState;
      notes: string;
    };
    storefront_deploy_automation: {
      status: CapabilityState;
      notes: string;
    };
    launch_workflow: {
      status: CapabilityState;
      notes: string;
    };
    domain_automation: {
      status: CapabilityState;
      notes: string;
    };
    payment_activation: {
      status: CapabilityState;
      notes: string;
    };
    operations_automation: {
      status: CapabilityState;
      notes: string;
    };
    app_ecosystem: {
      status: CapabilityState;
      notes: string;
    };
  };
  gaps: string[];
  next_targets: string[];
};

export async function getSitePlatformCapabilities(
  container: MedusaContainer,
  baseUrl: string | null
): Promise<SitePlatformCapabilities> {
  const managedSites = await listSiteManifests(container, {
    backendUrl: baseUrl,
  });
  const stripeConfigured =
    Boolean(process.env.STRIPE_API_KEY) &&
    Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const dokployConfigured =
    Boolean(process.env.DOKPLOY_API_KEY) &&
    Boolean(process.env.DOKPLOY_PROJECT_ID) &&
    Boolean(process.env.DOKPLOY_ENVIRONMENT_ID);
  const stripeProviderInstalled = true;
  const webhookPath = baseUrl
    ? `${baseUrl}/hooks/payment/stripe_stripe`
    : null;

  return {
    version: 1,
    privilege: "full-admin",
    platform: "ai-commerce-control-plane",
    admin_api: {
      base_url: baseUrl,
      site_builder_route: baseUrl ? `${baseUrl}/admin/site-builder` : null,
      quickstart_route: baseUrl
        ? `${baseUrl}/admin/site-builder/quickstart`
        : null,
      site_list_route: baseUrl ? `${baseUrl}/admin/site-builder/sites` : null,
      platform_route: baseUrl
        ? `${baseUrl}/admin/site-builder/platform`
        : null,
      authentication: "Authorization: Basic <secret-api-key>",
    },
    current_state: {
      managed_sites_count: managedSites.length,
      stripe: {
        provider_installed: stripeProviderInstalled,
        env_configured: stripeConfigured,
        webhook_path: webhookPath,
      },
        capabilities: {
          commerce_core: "ready",
          site_control_plane: "ready",
          theme_generation: "external",
          storefront_deploy_automation: dokployConfigured
            ? "partial"
            : "missing",
          launch_workflow: "partial",
          domain_automation: "missing",
          payment_activation: stripeConfigured ? "partial" : "missing",
          operations_automation: "partial",
          app_ecosystem: "missing",
      },
    },
    shopify_parity: {
      commerce_core: {
        status: "ready",
        notes: "Products, carts, checkout steps, shipping, and orders are already available in Medusa.",
      },
      site_control_plane: {
        status: "ready",
        notes: "Managed site manifests, quickstart intake, launch readiness, and per-site operational state are now exposed over admin APIs.",
      },
      theme_generation: {
        status: "external",
        notes: "AI design tools can drive this, but the generation runtime is intentionally outside this backend.",
      },
      storefront_deploy_automation: {
        status: dokployConfigured ? "partial" : "missing",
        notes: dokployConfigured
          ? "The backend can now trigger Dokploy application creation and deployment, but template-level storefront provisioning is not fully automated yet."
          : "The backend tracks deployment state, but it does not yet create or publish storefront deployments automatically.",
      },
      launch_workflow: {
        status: "partial",
        notes: "A single launch route now exists to combine site state updates with optional deployment triggering, but it does not yet automate domains and payments end to end.",
      },
      domain_automation: {
        status: "missing",
        notes: "The backend stores domain and SSL status, but DNS record creation and certificate issuance are not automated yet.",
      },
      payment_activation: {
        status: stripeConfigured ? "partial" : "missing",
        notes: stripeConfigured
          ? "Stripe provider scaffolding exists, but test/live account activation and webhook verification still need operational wiring."
          : "Stripe provider scaffolding exists, but live env keys and webhook configuration are not in place on this backend.",
      },
      operations_automation: {
        status: "partial",
        notes: "The backend can persist analytics, SEO, CRM, ads, and automation state, but it does not provision those integrations yet.",
      },
      app_ecosystem: {
        status: "missing",
        notes: "There is no Shopify-style app marketplace or install flow yet.",
      },
    },
    gaps: [
      "Automate storefront deployment creation and status callbacks.",
      "Automate domain DNS/SSL provisioning.",
      stripeConfigured
        ? "Finish Stripe activation, webhook verification, and refund operations."
        : "Set Stripe env vars on the backend and activate Stripe on the selling region.",
      dokployConfigured
        ? "Add storefront template selection and deployment callbacks on top of Dokploy deployment."
        : "Set Dokploy env vars on the backend so AI can trigger storefront deployments directly.",
      "Add installable provider model for analytics, CRM, email, and ads.",
      "Upgrade the launch workflow from orchestration-only to full deploy, domain, payments, and publish automation.",
    ],
    next_targets: [
      "Evolve the launch executor from control-plane orchestration into a full publish pipeline.",
      "Add provider adapters for domain, deployment, and payment activation.",
      "Add post-launch operational jobs for SEO, analytics, email, and campaign optimization.",
    ],
  };
}
