/**
 * Exercises the agent budget service against deterministic DB mocks so reset
 * and spend-gate behavior can be asserted without a live cloud database.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

const AGENT_ID = "00000000-0000-0000-0000-000000000001";
const ORG_ID = "00000000-0000-0000-0000-000000000002";

type BudgetRow = {
  id: string;
  agent_id: string;
  owner_org_id: string;
  allocated_budget: string;
  spent_budget: string;
  daily_limit: string | null;
  daily_spent: string;
  daily_reset_at: Date | null;
  auto_refill_enabled: boolean;
  auto_refill_amount: string | null;
  auto_refill_threshold: string | null;
  last_refill_at: Date | null;
  is_paused: boolean;
  pause_on_depleted: boolean;
  pause_reason: string | null;
  paused_at: Date | null;
  low_budget_threshold: string | null;
  low_budget_alert_sent: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

let readBudget: BudgetRow | null = null;
let dbUpdateValues: Record<string, unknown>[] = [];

class InsufficientCreditsError extends Error {}

const loggerMock = {
  debug: mock(() => undefined),
  error: mock(() => undefined),
  info: mock(() => undefined),
  warn: mock(() => undefined),
};

const dbWriteMock = {
  update: mock(() => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        dbUpdateValues.push(values);
      },
    }),
  })),
  insert: mock(() => ({
    values: () => ({
      returning: async () => [baseBudget()],
    }),
  })),
  transaction: mock(async (handler: (transaction: unknown) => Promise<unknown>) => handler({})),
};

const dbReadMock = {
  query: {
    agentBudgetTransactions: {
      findMany: mock(async () => []),
    },
    agentBudgets: {
      findMany: mock(async () => (readBudget ? [readBudget] : [])),
    },
    userCharacters: {
      findFirst: mock(async () => ({ id: AGENT_ID, organization_id: ORG_ID })),
    },
  },
  select: mock(() => ({
    from: () => ({
      where: async () => (readBudget ? [readBudget] : []),
    }),
  })),
};

mock.module("../../db/client", () => ({
  dbRead: dbReadMock,
  dbWrite: dbWriteMock,
}));

mock.module("../utils/logger", () => ({
  logger: loggerMock,
}));

mock.module("./credits", () => ({
  InsufficientCreditsError,
  creditsService: {
    reserve: mock(async () => ({
      reconcile: mock(async () => undefined),
    })),
  },
}));

mock.module("./email", () => ({
  emailService: {
    sendLowCreditsEmail: mock(async () => undefined),
  },
}));

const { agentBudgetService } = await import("./agent-budgets");

function baseBudget(overrides: Partial<BudgetRow> = {}): BudgetRow {
  const now = new Date("2026-07-04T12:00:00.000Z");

  return {
    id: "budget-1",
    agent_id: AGENT_ID,
    owner_org_id: ORG_ID,
    allocated_budget: "100.0000",
    spent_budget: "0.0000",
    daily_limit: null,
    daily_spent: "0.0000",
    daily_reset_at: null,
    auto_refill_enabled: false,
    auto_refill_amount: null,
    auto_refill_threshold: null,
    last_refill_at: null,
    is_paused: false,
    pause_on_depleted: true,
    pause_reason: null,
    paused_at: null,
    low_budget_threshold: "5.0000",
    low_budget_alert_sent: false,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

beforeEach(() => {
  readBudget = baseBudget();
  dbUpdateValues = [];
  dbReadMock.select.mockClear();
  dbWriteMock.update.mockClear();
  loggerMock.debug.mockClear();
  loggerMock.error.mockClear();
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
});

describe("agentBudgetService daily reset", () => {
  test("checkBudget computes dailyRemaining from the reset daily spend after expired reset", async () => {
    readBudget = baseBudget({
      daily_limit: "10.0000",
      daily_spent: "15.0000",
      daily_reset_at: new Date("2026-07-03T00:00:00.000Z"),
    });

    const result = await agentBudgetService.checkBudget(AGENT_ID, 1);

    expect(result).toMatchObject({
      canProceed: true,
      availableBudget: 100,
      dailyRemaining: 10,
      isPaused: false,
    });
    expect(dbUpdateValues).toHaveLength(1);
    expect(dbUpdateValues[0]).toMatchObject({
      daily_spent: "0.0000",
      daily_reset_at: expect.any(Date),
      updated_at: expect.any(Date),
    });
  });
});
