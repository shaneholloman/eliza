/**
 * Structural contract consumed by the cloud team-credential pool. The concrete
 * `AccountPool` implementation lives in app-core for self-hosted runtime
 * selection, but cloud-shared only needs this dependency-injected surface so it
 * can keep the app-core package optional and avoid a package dependency cycle.
 */
import type { LinkedAccountConfig } from "@elizaos/contracts";

export type Strategy = "priority" | "round-robin" | "least-used" | "quota-aware";

export type PoolProviderId = LinkedAccountConfig["providerId"];

export interface SelectInput {
  providerId: PoolProviderId;
  sessionKey?: string;
  strategy?: Strategy;
  accountIds?: string[];
  exclude?: string[];
}

export interface AccountPoolDeps {
  readAccounts: () => Record<string, LinkedAccountConfig>;
  writeAccount: (account: LinkedAccountConfig) => Promise<void>;
  deleteAccount?: (providerId: PoolProviderId, accountId: string) => Promise<void>;
}

export interface AccountPool {
  select(input: SelectInput): Promise<LinkedAccountConfig | null>;
  list(providerId?: PoolProviderId): LinkedAccountConfig[];
  get(accountId: string, providerId?: PoolProviderId): LinkedAccountConfig | null;
  markRateLimited(
    accountId: string,
    untilMs: number,
    detail?: string,
    opts?: { providerId?: PoolProviderId },
  ): Promise<void>;
  markNeedsReauth(
    accountId: string,
    detail?: string,
    opts?: { providerId?: PoolProviderId },
  ): Promise<void>;
  reprobeFlagged(): Promise<string[]>;
}

export interface AccountPoolConstructor {
  new (deps: AccountPoolDeps): AccountPool;
}
