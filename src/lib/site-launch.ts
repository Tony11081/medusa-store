import { MedusaContainer } from "@medusajs/framework/types";
import {
  retrieveSiteManifest,
  SiteBuilderManifest,
  updateSiteManifest,
} from "./site-builder";
import { deploySiteToProvider } from "./site-deploy";
import {
  SiteControlPlanePatchInput,
  SiteDeployInput,
  SiteLaunchInput,
} from "./site-builder-schema";

export type SiteLaunchResult = {
  version: number;
  privilege: "full-admin";
  site: SiteBuilderManifest;
  actions: Array<
    | "site_patch_applied"
    | "deployment_requested"
    | "launch_state_refreshed"
  >;
  launch: {
    executed_deploy: boolean;
    deployment_provider: string | null;
  };
};

export async function launchSite(
  container: MedusaContainer,
  reference: string,
  input: SiteLaunchInput,
  options: {
    backendUrl?: string | null;
  } = {}
): Promise<SiteLaunchResult> {
  const initialSite = await retrieveSiteManifest(container, reference, {
    backendUrl: options.backendUrl ?? null,
  });

  if (!initialSite) {
    throw new Error(`Unknown managed site: ${reference}`);
  }

  const actions: SiteLaunchResult["actions"] = [];
  let site = initialSite;
  const patch = buildLaunchPatch(initialSite, input.patch);

  if (patch) {
    site = await updateSiteManifest(container, reference, patch, {
      backendUrl: options.backendUrl ?? null,
    });
    actions.push("site_patch_applied");
  }

  if (input.deploy) {
    const deployInput = mergeDeployEnv(site, input.deploy);
    const deployment = await deploySiteToProvider(
      container,
      reference,
      deployInput,
      {
        backendUrl: options.backendUrl ?? null,
      }
    );
    site = deployment.site;
    actions.push("deployment_requested");
  }

  const refreshed = await retrieveSiteManifest(container, reference, {
    backendUrl: options.backendUrl ?? null,
  });

  if (!refreshed) {
    throw new Error(`Failed to reload managed site after launch: ${reference}`);
  }

  actions.push("launch_state_refreshed");

  return {
    version: 1,
    privilege: "full-admin",
    site: refreshed,
    actions,
    launch: {
      executed_deploy: Boolean(input.deploy),
      deployment_provider: input.deploy?.provider ?? null,
    },
  };
}

function buildLaunchPatch(
  site: SiteBuilderManifest,
  input: SiteControlPlanePatchInput | undefined
): SiteControlPlanePatchInput | null {
  const patch = clonePatch(input);

  if (!patch) {
    return site.site.domain
      ? {
          platform: {
            domain: {
              hostname: site.site.domain,
              dns_status: site.platform.domain.dns_status ?? "pending",
              ssl_status: site.platform.domain.ssl_status ?? "pending",
            },
          },
        }
      : null;
  }

  if (site.site.domain) {
    patch.platform ??= {};
    patch.platform.domain ??= {};
    patch.platform.domain.hostname ??= site.site.domain;
    patch.platform.domain.dns_status ??=
      site.platform.domain.dns_status ??
      (site.platform.domain.hostname || site.site.domain ? "pending" : undefined);
    patch.platform.domain.ssl_status ??=
      site.platform.domain.ssl_status ??
      (site.platform.domain.hostname || site.site.domain ? "pending" : undefined);
  }

  return patch;
}

function mergeDeployEnv(
  site: SiteBuilderManifest,
  deploy: SiteDeployInput
): SiteDeployInput {
  return {
    ...deploy,
    target: {
      ...deploy.target,
      env: {
        MEDUSA_BACKEND_URL: site.storefront_env.MEDUSA_BACKEND_URL ?? "",
        NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
          site.storefront_env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        SITE_SLUG: site.storefront_env.SITE_SLUG,
        NEXT_PUBLIC_SITE_SLUG: site.storefront_env.SITE_SLUG,
        ...(site.site.domain
          ? {
              NEXT_PUBLIC_SITE_DOMAIN: site.site.domain,
            }
          : {}),
        ...deploy.target.env,
      },
    },
  };
}

function clonePatch(
  input: SiteControlPlanePatchInput | undefined
): SiteControlPlanePatchInput | null {
  if (!input) {
    return null;
  }

  return JSON.parse(JSON.stringify(input)) as SiteControlPlanePatchInput;
}
