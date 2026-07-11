/** Credit mutations must invalidate every balance view, including inference admission. */

import { beforeEach, expect, mock, test } from "bun:test";
import { CacheKeys } from "./keys";

const deleted: string[] = [];
const deletedPatterns: string[] = [];
const memoryInvalidations: string[] = [];

mock.module("./client", () => ({
  cache: {
    del: async (key: string) => {
      deleted.push(key);
      return true;
    },
    delPattern: async (pattern: string) => {
      deletedPatterns.push(pattern);
      return 1;
    },
  },
}));

mock.module("./memory-cache", () => ({
  memoryCache: {
    invalidateOrganization: async (organizationId: string) => {
      memoryInvalidations.push(`organization:${organizationId}`);
    },
    invalidateRoom: async (roomId: string, organizationId: string) => {
      memoryInvalidations.push(`room:${roomId}:${organizationId}`);
    },
    invalidateMemory: async (memoryId: string) => {
      memoryInvalidations.push(`memory:${memoryId}`);
    },
    invalidateConversation: async (conversationId: string) => {
      memoryInvalidations.push(`conversation:${conversationId}`);
    },
  },
}));

mock.module("../utils/logger", () => ({
  // Bun module mocks are process-global across changed-file coverage runs, so
  // preserve the complete logger contract for tests loaded after this file.
  logger: {
    debug: mock(() => undefined),
    error: mock(() => undefined),
    info: mock(() => undefined),
    warn: mock(() => undefined),
  },
}));

const { CacheInvalidation } = await import("./invalidation");

beforeEach(() => {
  deleted.length = 0;
  deletedPatterns.length = 0;
  memoryInvalidations.length = 0;
});

test("onCreditMutation drops the optimistic inference balance hint", async () => {
  const organizationId = "org-credit-mutation";

  await CacheInvalidation.onCreditMutation(organizationId);

  expect(deleted).toContain(CacheKeys.inference.orgBalance(organizationId));
  expect(deleted).toContain(CacheKeys.org.credits(organizationId));
  expect(deleted).toContain(CacheKeys.eliza.orgBalance(organizationId));
});

test("central invalidation routes every mutation to its scoped cache keys", async () => {
  const organizationId = "org-invalidation-contract";

  await CacheInvalidation.onUsageRecordCreated(organizationId);
  await CacheInvalidation.onGenerationCreated(organizationId);
  await CacheInvalidation.onOrganizationUpdated(organizationId);
  await CacheInvalidation.clearAll(organizationId);
  await CacheInvalidation.onMemoryCreated(organizationId);
  await CacheInvalidation.onMemoryCreated(organizationId, "room-1");
  await CacheInvalidation.onMemoryDeleted(organizationId, "memory-1");
  await CacheInvalidation.onConversationUpdated("conversation-1");

  expect(deleted).toContain(CacheKeys.org.dashboard(organizationId));
  expect(deleted).toContain(CacheKeys.org.data(organizationId));
  expect(deletedPatterns).toContain(`analytics:overview:${organizationId}:*`);
  expect(deletedPatterns).toContain(CacheKeys.org.pattern(organizationId));
  expect(deletedPatterns).toContain(CacheKeys.analytics.pattern(organizationId));
  expect(memoryInvalidations).toEqual([
    `organization:${organizationId}`,
    `room:room-1:${organizationId}`,
    "memory:memory-1",
    "conversation:conversation-1",
  ]);
});
