/**
 * Mock payment service. Per Phase 1 Assumption 5, external payment processing
 * is treated as a black box that succeeds in tests unless failure is explicitly
 * injected. The injection mechanism here lets us test transactional rollback
 * (AC-004.2) without needing a real payment gateway.
 */

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

interface PaymentRequest {
  customerId: string;
  amountCents: number;
  reference: string;
}

let nextFailure: { reference?: string; reason?: string } | null = null;

export function injectPaymentFailure(reference?: string, reason = 'payment declined'): void {
  nextFailure = { reference, reason };
}

export function clearPaymentFailureInjection(): void {
  nextFailure = null;
}

function shouldFail(reference: string): boolean {
  if (!nextFailure) return false;
  if (nextFailure.reference === undefined || nextFailure.reference === reference) {
    return true;
  }
  return false;
}

export async function chargePayment(req: PaymentRequest): Promise<PaymentResult> {
  if (shouldFail(req.reference)) {
    const reason = nextFailure?.reason ?? 'payment declined';
    nextFailure = null;
    return { success: false, error: reason };
  }
  return {
    success: true,
    transactionId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  };
}

export async function reverseCharge(transactionId: string): Promise<PaymentResult> {
  return {
    success: true,
    transactionId: `reverse-${transactionId}`
  };
}

export async function refundPayment(req: PaymentRequest): Promise<PaymentResult> {
  if (shouldFail(req.reference)) {
    const reason = nextFailure?.reason ?? 'refund failed';
    nextFailure = null;
    return { success: false, error: reason };
  }
  return {
    success: true,
    transactionId: `refund-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  };
}
