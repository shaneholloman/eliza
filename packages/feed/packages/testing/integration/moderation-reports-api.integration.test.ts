import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { db } from "@feed/db";
import {
  getAdminToken,
  requireServer,
  waitForServerAvailability,
} from "./helpers";

const BASE_URL =
  process.env.TEST_API_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 55_000;
const RUN_ID = `reports-${Date.now()}-${Math.random().toString(16).slice(2)}`;

setDefaultTimeout(60_000);

let serverAvailable = false;
let adminToken: string | null = null;
const userIds: string[] = [];
const postIds: string[] = [];
const reportIds: string[] = [];

function uniqueWalletAddress(): `0x${string}` {
  return `0x${crypto.randomUUID().replaceAll("-", "").padEnd(40, "0")}`;
}

function authHeaders(userId: string): HeadersInit {
  return {
    Authorization: `Bearer steward:test:${userId}`,
    "Content-Type": "application/json",
  };
}

async function createTestUser(label: string) {
  const id = `${RUN_ID}-${label}`;
  userIds.push(id);
  return await db.user.create({
    data: {
      id,
      username: `${RUN_ID}-${label}`,
      displayName: `Report Test ${label}`,
      walletAddress: uniqueWalletAddress(),
      profileComplete: true,
      updatedAt: new Date(),
    },
  });
}

async function createTestPost(authorId: string) {
  const id = `${RUN_ID}-post`;
  postIds.push(id);
  return await db.post.create({
    data: {
      id,
      authorId,
      content: "Reportable integration-test post",
    },
  });
}

async function postReport(body: Record<string, unknown>, reporterId: string) {
  return await fetch(`${BASE_URL}/api/moderation/reports`, {
    method: "POST",
    headers: authHeaders(reporterId),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

describe("Moderation reports API", () => {
  beforeAll(async () => {
    serverAvailable = await waitForServerAvailability(BASE_URL, 15);
    adminToken = getAdminToken();
  });

  afterAll(async () => {
    if (reportIds.length > 0) {
      await db.report.deleteMany({ where: { id: { in: reportIds } } });
    }
    if (postIds.length > 0) {
      await db.post.deleteMany({ where: { id: { in: postIds } } });
    }
    if (userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  test("GET /api/moderation/reports returns 401 without auth", async () => {
    requireServer(serverAvailable, BASE_URL);

    const response = await fetch(`${BASE_URL}/api/moderation/reports`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    expect(response.status).toBe(401);
  });

  test("POST /api/moderation/reports creates a user report row", async () => {
    requireServer(serverAvailable, BASE_URL);
    const reporter = await createTestUser("reporter");
    const reported = await createTestUser("reported");

    const response = await postReport(
      {
        reportType: "user",
        reportedUserId: reported.id,
        category: "harassment",
        reason: "Targeted harassment in repeated replies.",
      },
      reporter.id,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      success: boolean;
      report: { id: string; reporterId: string; reportedUserId: string };
    };
    expect(payload.success).toBe(true);
    expect(payload.report.reporterId).toBe(reporter.id);
    expect(payload.report.reportedUserId).toBe(reported.id);
    reportIds.push(payload.report.id);

    const stored = await db.report.findUnique({
      where: { id: payload.report.id },
    });
    expect(stored?.category).toBe("harassment");
    expect(stored?.status).toBe("pending");
    expect(stored?.priority).toBe("normal");
  });

  test("POST /api/moderation/reports resolves post author into reportedUserId", async () => {
    requireServer(serverAvailable, BASE_URL);
    const reporter = await createTestUser("post-reporter");
    const reported = await createTestUser("post-author");
    const post = await createTestPost(reported.id);

    const response = await postReport(
      {
        reportType: "post",
        reportedPostId: post.id,
        category: "spam",
        reason: "This post is a repeated scam campaign.",
      },
      reporter.id,
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      success: boolean;
      report: {
        id: string;
        reporterId: string;
        reportedUserId: string;
        reportedPostId: string;
      };
    };
    expect(payload.success).toBe(true);
    expect(payload.report.reportedUserId).toBe(reported.id);
    expect(payload.report.reportedPostId).toBe(post.id);
    reportIds.push(payload.report.id);

    const stored = await db.report.findUnique({
      where: { id: payload.report.id },
    });
    expect(stored?.reportedUserId).toBe(reported.id);
    expect(stored?.reportedPostId).toBe(post.id);
  });

  test("GET /api/moderation/reports lists reports for admins", async () => {
    requireServer(serverAvailable, BASE_URL);
    expect(adminToken).toBeTruthy();
    if (!adminToken) {
      throw new Error("admin token unavailable for report-list coverage");
    }

    const response = await fetch(
      `${BASE_URL}/api/moderation/reports?limit=5&status=pending`,
      {
        headers: { "x-dev-admin-token": adminToken },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      reports: unknown[];
      pagination: { limit: number; offset: number; total: number };
    };
    expect(Array.isArray(payload.reports)).toBe(true);
    expect(payload.pagination.limit).toBe(5);
    expect(payload.pagination.total).toBeGreaterThanOrEqual(0);
  });
});
