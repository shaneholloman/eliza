/**
 * Ad-account approval gates for advertising spend.
 *
 * New ad accounts start pending and only platform operators can move them to
 * active through the API. These tests exercise the service state machine and
 * every spend entrypoint that must reject pending/suspended/disconnected
 * accounts before content safety, credits, or provider calls can run.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  adAccountsRepository,
  adCampaignsRepository,
} from "../../../db/repositories";
import type {
  AdAccount,
  AdAccountStatus,
} from "../../../db/schemas/ad-accounts";
import type { AdCampaign } from "../../../db/schemas/ad-campaigns";
import { advertisingService } from "../advertising";

const ORG_ID = "00000000-0000-4000-8000-0000000000aa";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000bb";
const CAMPAIGN_ID = "00000000-0000-4000-8000-0000000000cc";

const spies: Array<{ mockRestore: () => void }> = [];
function track<T extends { mockRestore: () => void }>(spy: T): T {
  spies.push(spy);
  return spy;
}

afterEach(() => {
  for (const spy of spies.splice(0)) {
    spy.mockRestore();
  }
});

function makeAccount(status: AdAccountStatus): AdAccount {
  return {
    id: ACCOUNT_ID,
    organization_id: ORG_ID,
    connected_by_user_id: "00000000-0000-4000-8000-0000000000dd",
    platform: "meta",
    external_account_id: "act_1",
    account_name: "Account",
    access_token_secret_id: "00000000-0000-4000-8000-0000000000ee",
    refresh_token_secret_id: null,
    token_expires_at: null,
    status,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeCampaign(override: Partial<AdCampaign> = {}): AdCampaign {
  return {
    id: CAMPAIGN_ID,
    organization_id: ORG_ID,
    ad_account_id: ACCOUNT_ID,
    external_campaign_id: "ext-campaign-1",
    name: "Campaign",
    platform: "meta",
    objective: "awareness",
    status: "active",
    budget_type: "daily",
    budget_amount: "100.00",
    budget_currency: "USD",
    credits_allocated: "120.00",
    credits_spent: "0.00",
    start_date: null,
    end_date: null,
    targeting: {},
    total_spend: "0.00",
    total_impressions: 0,
    total_clicks: 0,
    total_conversions: 0,
    app_id: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...override,
  };
}

describe("ad account approval state machine", () => {
  test("approves pending accounts and is idempotent for already-active accounts", async () => {
    const find = track(
      spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount("pending")),
    );
    const update = track(
      spyOn(adAccountsRepository, "updateStatus").mockResolvedValue(makeAccount("active")),
    );

    const result = await advertisingService.approveAccount(ACCOUNT_ID);

    expect(result.status).toBe("active");
    expect(update).toHaveBeenCalledWith(ACCOUNT_ID, "active");

    update.mockClear();
    find.mockResolvedValue(makeAccount("active"));

    const active = await advertisingService.approveAccount(ACCOUNT_ID);

    expect(active.status).toBe("active");
    expect(update).not.toHaveBeenCalled();
  });

  test("refuses to approve suspended accounts", async () => {
    track(spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount("suspended")));
    const update = track(
      spyOn(adAccountsRepository, "updateStatus").mockResolvedValue(makeAccount("active")),
    );

    await expect(advertisingService.approveAccount(ACCOUNT_ID)).rejects.toThrow(
      /only "pending"/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  test("rejecting an account suspends it and pauses active local campaigns", async () => {
    track(spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount("active")));
    const updateAccount = track(
      spyOn(adAccountsRepository, "updateStatus").mockResolvedValue(makeAccount("suspended")),
    );
    track(
      spyOn(adCampaignsRepository, "listByAdAccount").mockResolvedValue([
        makeCampaign({ external_campaign_id: null }),
        makeCampaign({
          id: "00000000-0000-4000-8000-0000000000cd",
          status: "paused",
          external_campaign_id: null,
        }),
      ]),
    );
    const updateCampaign = track(
      spyOn(adCampaignsRepository, "updateStatus").mockResolvedValue(
        makeCampaign({ status: "paused" }),
      ),
    );

    const result = await advertisingService.rejectAccount(ACCOUNT_ID);

    expect(result.status).toBe("suspended");
    expect(updateAccount).toHaveBeenCalledWith(ACCOUNT_ID, "suspended");
    expect(updateCampaign).toHaveBeenCalledTimes(1);
    expect(updateCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, "paused");
  });

  test("rejecting an already-suspended account is idempotent", async () => {
    track(spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount("suspended")));
    const updateAccount = track(
      spyOn(adAccountsRepository, "updateStatus").mockResolvedValue(makeAccount("suspended")),
    );
    const listCampaigns = track(
      spyOn(adCampaignsRepository, "listByAdAccount").mockResolvedValue([]),
    );

    const result = await advertisingService.rejectAccount(ACCOUNT_ID);

    expect(result.status).toBe("suspended");
    expect(updateAccount).not.toHaveBeenCalled();
    expect(listCampaigns).not.toHaveBeenCalled();
  });
});

describe("advertising spend requires an active account", () => {
  for (const status of ["pending", "suspended", "disconnected"] as const) {
    test(`createCampaign is blocked when account is ${status}`, async () => {
      track(spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount(status)));

      await expect(
        advertisingService.createCampaign({
          organizationId: ORG_ID,
          adAccountId: ACCOUNT_ID,
          name: "Campaign",
          objective: "awareness",
          budgetType: "daily",
          budgetAmount: 100,
        }),
      ).rejects.toThrow(/not active/);
    });

    test(`updateCampaign is blocked when account is ${status}`, async () => {
      track(spyOn(adCampaignsRepository, "findById").mockResolvedValue(makeCampaign()));
      track(spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount(status)));

      await expect(
        advertisingService.updateCampaign(CAMPAIGN_ID, ORG_ID, {
          budgetAmount: 50,
        }),
      ).rejects.toThrow(/not active/);
    });

    test(`startCampaign is blocked when account is ${status}`, async () => {
      track(spyOn(adCampaignsRepository, "findById").mockResolvedValue(makeCampaign()));
      track(spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount(status)));

      await expect(
        advertisingService.startCampaign(CAMPAIGN_ID, ORG_ID),
      ).rejects.toThrow(/not active/);
    });

    test(`createCreative is blocked when account is ${status}`, async () => {
      track(spyOn(adCampaignsRepository, "findById").mockResolvedValue(makeCampaign()));
      track(spyOn(adAccountsRepository, "findById").mockResolvedValue(makeAccount(status)));

      await expect(
        advertisingService.createCreative(ORG_ID, {
          campaignId: CAMPAIGN_ID,
          name: "Creative",
          type: "image",
          media: [],
        }),
      ).rejects.toThrow(/not active/);
    });
  }
});
