import { mercadoPagoGateway } from "./mercadopago";
import type { PaymentGateway } from "./types";

const gateways: Map<string, PaymentGateway> = new Map([
  ["mercadopago", mercadoPagoGateway],
]);

export function getGateway(id: string): PaymentGateway | undefined {
  return gateways.get(id);
}

export function listGateways(): PaymentGateway[] {
  return Array.from(gateways.values());
}

export { mercadoPagoGateway };
export type { PaymentGateway, PaymentRequest, PaymentResponse } from "./types";
