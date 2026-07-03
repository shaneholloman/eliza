import { Hono } from "hono";
import { failureResponse, jsonError } from "@/lib/api/cloud-worker-errors";
import { requireUserOrApiKeyWithOrg } from "@/lib/auth/workers-hono-auth";
import {
  RateLimitPresets,
  rateLimit,
} from "@/lib/middleware/rate-limit-hono-cloudflare";
import { cloudFilesService } from "@/lib/services/cloud-files";
import type { AppEnv } from "@/types/cloud-worker-env";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

function toClientFile(
  file: NonNullable<Awaited<ReturnType<typeof cloudFilesService.get>>>,
) {
  return {
    id: file.id,
    source: file.source,
    kind: file.kind,
    filename: file.filename,
    mimeType: file.mime_type,
    sizeBytes: Number(file.size_bytes),
    sha256: file.sha256,
    url: file.storage_url,
    generationId: file.generation_id,
    metadata: file.metadata,
    createdAt: file.created_at,
    updatedAt: file.updated_at,
  };
}

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const file = await cloudFilesService.get(
      user.organization_id,
      c.req.param("id")!,
    );
    if (!file) return jsonError(c, 404, "File not found", "resource_not_found");
    return c.json({ success: true, file: toClientFile(file) });
  } catch (error) {
    return failureResponse(c, error);
  }
});

app.delete("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const deleted = await cloudFilesService.delete(
      c.env,
      user.organization_id,
      c.req.param("id")!,
    );
    if (!deleted)
      return jsonError(c, 404, "File not found", "resource_not_found");
    return c.json({ success: true, deleted: true, id: deleted.id });
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
