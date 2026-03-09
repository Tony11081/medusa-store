import { MedusaContainer } from "@medusajs/framework/types";
import { retrieveSiteManifest, updateSiteManifest } from "./site-builder";
import { SiteDeployInput } from "./site-builder-schema";

type DokployDeploymentResponse = {
  site: Awaited<ReturnType<typeof updateSiteManifest>>;
  deployment: {
    provider: "dokploy";
    application_id: string;
    app_name: string;
    deploy_triggered: boolean;
    base_url: string;
    repository: string;
    owner: string;
    branch: string;
  };
};

type DokployAppResponse = {
  applicationId?: string;
  appName?: string;
  name?: string;
  domains?: Array<{ host?: string }>;
  [key: string]: unknown;
};

export async function deploySiteToProvider(
  container: MedusaContainer,
  reference: string,
  input: SiteDeployInput,
  options: {
    backendUrl?: string | null;
  } = {}
): Promise<DokployDeploymentResponse> {
  if (input.provider !== "dokploy") {
    throw new Error(`Unsupported deployment provider: ${input.provider}`);
  }

  const site = await retrieveSiteManifest(container, reference, {
    backendUrl: options.backendUrl ?? null,
  });

  if (!site) {
    throw new Error(`Unknown managed site: ${reference}`);
  }

  const dokployBaseUrl =
    input.target.base_url ??
    process.env.DOKPLOY_BASE_URL ??
    "https://admin.openaigrowth.com";
  const dokployApiKey =
    input.target.api_key ?? process.env.DOKPLOY_API_KEY ?? null;
  const projectId =
    input.target.project_id ?? process.env.DOKPLOY_PROJECT_ID ?? null;
  const environmentId =
    input.target.environment_id ?? process.env.DOKPLOY_ENVIRONMENT_ID ?? null;

  if (!dokployApiKey) {
    throw new Error("Missing Dokploy API key.");
  }

  if (!input.target.application_id && (!projectId || !environmentId)) {
    throw new Error(
      "Missing Dokploy project/environment identifiers for application creation."
    );
  }

  const appName =
    input.target.app_name ??
    slugify(`${site.site.slug}-${input.target.repository}`);
  const appLabel = input.target.name ?? `${site.site.name} Storefront`;
  const appDescription =
    input.target.description ??
    `Storefront deployment for ${site.site.name} (${site.site.slug})`;

  const createOrUpdateResult = input.target.application_id
    ? {
        applicationId: input.target.application_id,
        appName,
      }
    : await createDokployApplication({
        baseUrl: dokployBaseUrl,
        apiKey: dokployApiKey,
        payload: {
          name: appLabel,
          appName,
          description: appDescription,
          projectId,
          environmentId,
          sourceType: "github",
          owner: input.target.owner,
          repository: input.target.repository,
          branch: input.target.branch,
          buildType: input.target.build_type,
          dockerfile:
            input.target.build_type === "dockerfile"
              ? input.target.dockerfile ?? "Dockerfile"
              : undefined,
          previewPort: input.target.preview_port,
        },
      });

  if (Object.keys(input.target.env).length) {
    await requestDokploy(dokployBaseUrl, dokployApiKey, "POST", "/api/application.update", {
      applicationId: createOrUpdateResult.applicationId,
      env: serializeEnv(input.target.env),
    });
  }

  if (input.target.auto_deploy) {
    await requestDokploy(
      dokployBaseUrl,
      dokployApiKey,
      "POST",
      "/api/application.deploy",
      {
        applicationId: createOrUpdateResult.applicationId,
      }
    );
  }

  const application = await requestDokploy<DokployAppResponse>(
    dokployBaseUrl,
    dokployApiKey,
    "GET",
    `/api/application.one?applicationId=${encodeURIComponent(
      createOrUpdateResult.applicationId
    )}`
  );

  const deploymentUrl =
    input.target.url ??
    deriveApplicationUrl(application) ??
    site.platform.deployment.url ??
    null;

  const updatedSite = await updateSiteManifest(
    container,
    reference,
    {
      platform: {
        deployment: {
          provider: "dokploy",
          project_id: createOrUpdateResult.applicationId,
          environment: "production",
          status: input.target.auto_deploy ? "queued" : "not_started",
          url: deploymentUrl ?? undefined,
          metadata: {
            app_name: createOrUpdateResult.appName,
            repository: input.target.repository,
            owner: input.target.owner,
            branch: input.target.branch,
            build_type: input.target.build_type,
            preview_port: input.target.preview_port,
            dokploy_base_url: dokployBaseUrl,
          },
        },
      },
    },
    {
      backendUrl: options.backendUrl ?? null,
    }
  );

  return {
    site: updatedSite,
    deployment: {
      provider: "dokploy",
      application_id: createOrUpdateResult.applicationId,
      app_name: createOrUpdateResult.appName,
      deploy_triggered: input.target.auto_deploy,
      base_url: dokployBaseUrl,
      repository: input.target.repository,
      owner: input.target.owner,
      branch: input.target.branch,
    },
  };
}

async function createDokployApplication(input: {
  baseUrl: string;
  apiKey: string;
  payload: Record<string, unknown>;
}): Promise<{
  applicationId: string;
  appName: string;
}> {
  const response = await requestDokploy<DokployAppResponse>(
    input.baseUrl,
    input.apiKey,
    "POST",
    "/api/application.create",
    input.payload
  );
  const applicationId = response.applicationId;
  const appName =
    response.appName ??
    (typeof input.payload.appName === "string" ? input.payload.appName : null);

  if (!applicationId || !appName) {
    throw new Error("Dokploy application.create did not return an application id.");
  }

  return {
    applicationId,
    appName,
  };
}

async function requestDokploy<T>(
  baseUrl: string,
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(path, ensureTrailingSlash(baseUrl));
  const response = await fetch(url, {
    method,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  const data = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    throw new Error(
      `Dokploy request failed (${response.status} ${response.statusText}): ${raw}`
    );
  }

  return data as T;
}

function serializeEnv(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function deriveApplicationUrl(application: DokployAppResponse): string | null {
  const host = application.domains?.[0]?.host;

  if (!host) {
    return null;
  }

  return host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `http://${host}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
