/**
 * Regression coverage for the Cloud platform A2A account skills. The harness
 * keeps auth, storage, and repositories deterministic while exercising the real
 * A2A task shaping and JSON-RPC boundary.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppContext } from "../../../types/cloud-worker-env";
import type { JSONRPCErrorResponse, JSONRPCSuccessResponse, Task } from "../../types/a2a";

const organizationsRepository = {
  findById: mock(),
};
const creditsService = {
  listTransactionsByOrganization: mock(),
};
const executeCloudCapabilityRest = mock();
const requireUserOrApiKeyWithOrg = mock();
const taskStoreSet = mock();
const loggerError = mock();

mock.module("../../cloud-capabilities", () => ({
  executeCloudCapabilityRest,
  getCloudCapabilities: () => [
    {
      id: "credits-summary",
      title: "Credits summary",
      summary: "Read credits summary",
      category: "billing",
      auth: { adminOnly: false, modes: ["bearer"] },
      billing: null,
      surfaces: {
        a2a: { skill: "cloud.credits.summary" },
        mcp: { tool: "cloud_credits_summary" },
        rest: { method: "GET", path: "/api/credits/summary" },
      },
    },
  ],
}));

mock.module("../../../db/repositories", () => ({
  organizationsRepository,
}));

mock.module("../../auth/workers-hono-auth", () => ({
  requireAdmin: mock(async () => undefined),
  requireUserOrApiKeyWithOrg,
}));

mock.module("../../services/credits", () => ({
  creditsService,
}));

mock.module("../../services/active-billing", () => ({
  activeBillingService: {
    listActiveResources: mock(),
    listLedger: mock(),
    cancelResource: mock(),
  },
}));

mock.module("../../services/containers", () => ({
  containersService: {
    listByOrganization: mock(),
    checkQuota: mock(),
  },
}));

mock.module("../../services/a2a-task-store", () => ({
  a2aTaskStoreService: {
    set: taskStoreSet,
    get: mock(),
    updateTaskState: mock(),
  },
}));

mock.module("../../utils/logger", () => ({
  logger: { error: loggerError, warn: mock(), info: mock(), debug: mock() },
}));

const { handlePlatformA2aJsonRpc, handlePlatformMessageSend } = await import("./platform-cloud");

const context = {
  env: { NEXT_PUBLIC_APP_URL: "https://cloud.test" },
  req: { url: "https://cloud.test/api/a2a" },
} as AppContext;

const user = {
  id: "user-1",
  email: "user@example.com",
  wallet_address: null,
  organization_id: "org-1",
  organization: { id: "org-1", name: "Org One" },
  role: "user",
};

function creditsSummaryParams() {
  return {
    message: {
      role: "user",
      parts: [{ type: "data", data: { skill: "cloud.credits.summary" } }],
    },
  };
}

function creditsSummaryData(task: Task) {
  const messagePart = task.status.message?.parts.find((part) => part.type === "data");
  if (messagePart?.type !== "data") throw new Error("credits summary result missing data part");
  return messagePart.data as {
    organizationId: string;
    balance: number;
    recentTransactions: unknown[];
  };
}

beforeEach(() => {
  organizationsRepository.findById.mockReset();
  creditsService.listTransactionsByOrganization.mockReset();
  requireUserOrApiKeyWithOrg.mockReset();
  taskStoreSet.mockReset();
  loggerError.mockReset();

  requireUserOrApiKeyWithOrg.mockResolvedValue(user);
  creditsService.listTransactionsByOrganization.mockResolvedValue([{ id: "txn-1" }]);
  taskStoreSet.mockResolvedValue(undefined);
});

describe("Cloud platform A2A credits summary", () => {
  test("reads Postgres NUMERIC credit_balance as a decimal instead of fabricating task data", async () => {
    organizationsRepository.findById.mockResolvedValue({ id: "org-1", credit_balance: "10.50" });

    const task = await handlePlatformMessageSend(context, creditsSummaryParams());

    expect(creditsSummaryData(task)).toEqual({
      organizationId: "org-1",
      balance: 10.5,
      recentTransactions: [{ id: "txn-1" }],
    });
    expect(taskStoreSet).toHaveBeenCalledTimes(1);
  });

  test("throws on corrupt credit_balance rather than returning NaN", async () => {
    organizationsRepository.findById.mockResolvedValue({ id: "org-1", credit_balance: "NaN" });

    await expect(handlePlatformMessageSend(context, creditsSummaryParams())).rejects.toThrow(
      /credit_balance/,
    );
    expect(taskStoreSet).not.toHaveBeenCalled();
  });

  test("JSON-RPC boundary reports a missing organization instead of returning balance zero", async () => {
    organizationsRepository.findById.mockResolvedValue(undefined);

    const response = (await handlePlatformA2aJsonRpc(context, {
      id: "rpc-1",
      method: "message/send",
      params: creditsSummaryParams(),
    })) as JSONRPCSuccessResponse<Task> | JSONRPCErrorResponse;

    expect("result" in response).toBe(false);
    expect((response as JSONRPCErrorResponse).error).toMatchObject({
      code: -32000,
      message: "Organization not found for credits summary: org-1",
    });
    expect(taskStoreSet).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      "[A2A Platform] JSON-RPC dispatch failed",
      expect.objectContaining({
        method: "message/send",
        error: "Organization not found for credits summary: org-1",
      }),
    );
  });
});
