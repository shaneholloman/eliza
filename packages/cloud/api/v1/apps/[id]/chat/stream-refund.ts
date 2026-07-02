import { logger } from "@/lib/utils/logger";

/**
 * The credit-reconcile surface {@link reconcileChatSettleError} needs.
 * Structural so the helper and tests do not import the whole app-credits
 * service or the DB it wires up.
 */
export interface ChatSettleCredits {
  reconcileCredits(args: {
    appId: string;
    userId: string;
    estimatedBaseCost: number;
    actualBaseCost: number;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
}

/**
 * Money-critical: after an app-chat upfront hold was debited, refund the full
 * reserved amount only when `skipRefund` is false. Both streaming and
 * non-streaming call sites share this decision, but pass their own log strings
 * and ledger tags so the money movement remains attributable.
 */
export async function reconcileChatSettleError(
  params: {
    skipRefund: boolean;
    skipRefundLog: string;
    refundLog: string;
    refundDescription: string;
    refundMetadata: Record<string, unknown>;
    appId: string;
    userId: string;
    reservedBaseCost: number;
    errorMessage: string;
  },
  credits: ChatSettleCredits,
): Promise<{ refunded: boolean }> {
  const {
    skipRefund,
    skipRefundLog,
    refundLog,
    refundDescription,
    refundMetadata,
    appId,
    userId,
    reservedBaseCost,
    errorMessage,
  } = params;

  const logContext = { appId, userId, reservedBaseCost, error: errorMessage };
  if (skipRefund) {
    logger.error(skipRefundLog, logContext);
    return { refunded: false };
  }

  logger.error(refundLog, logContext);
  await credits.reconcileCredits({
    appId,
    userId,
    estimatedBaseCost: reservedBaseCost,
    actualBaseCost: 0,
    description: refundDescription,
    metadata: refundMetadata,
  });
  return { refunded: true };
}
