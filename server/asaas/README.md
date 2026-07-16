# Conector Asaas

Integração portável com o gateway de pagamento **Asaas** (PIX, boleto, cartão,
assinaturas, links de pagamento, estornos, webhooks). Construído no mesmo padrão
do conector SmartEnvios: framework-agnostic, com **modo mock** para desenvolver
sem conta e um **servidor MCP** para agentes de IA.

Conector portável: copie a pasta `server/asaas/` para qualquer projeto Node do template.

## Arquivos

| Arquivo | Papel |
|---|---|
| `config.ts` | `loadConfig(env)` → `AsaasConfig`. Lê tudo de env vars. |
| `types.ts` | Tipos da API v3 (clientes, cobranças, assinaturas, webhooks…). |
| `client.ts` | HTTP client (header `access_token` + `User-Agent`), normaliza `{errors[]}`. |
| `service.ts` | Operações de alto nível, com fallback mock. |
| `index.ts` | Re-exports. |
| `mcp.ts` | Servidor MCP stdio (13 ferramentas). |

A **cola de domínio** (mapeamento de status, materialização de pedido de
assinatura, auto-etiqueta, poller) fica em `server/asaas-integration.ts`, e as
**rotas HTTP** em `server/routes/{payments,webhooks,admin-payments}.ts` — essas
peças dependem do app e são reescritas ao portar.

## Variáveis de ambiente

```
ASAAS_API_KEY=            # vazio = MOCK. Sandbox começa com $aact_hmlg_
ASAAS_ENV=sandbox         # sandbox | production
ASAAS_MOCK=               # 1 força mock mesmo com chave
ASAAS_USER_AGENT=LojaVirtual
ASAAS_WEBHOOK_TOKEN=      # segredo do header asaas-access-token (gere forte)
ASAAS_WEBHOOK_URL=        # URL pública do /api/webhooks/asaas
ASAAS_AUTO_LABEL=0        # 1 = etiqueta SmartEnvios ao confirmar pagamento
ASAAS_RECONCILE_MINUTES=5 # poller (0 desliga)
ASAAS_MAX_INSTALLMENTS=12
```

## Fluxo de pagamento

1. Cliente cria o pedido (checkout) → `POST /api/payments/checkout` com método + CPF.
2. Backend garante o cliente Asaas (`ensureCustomer` dedup por CPF), cria a cobrança
   e grava uma `payment_transactions`.
3. **PIX/boleto**: front mostra QR/linha e faz *polling* de `GET /api/payments/status/:orderNumber`.
   **Cartão**: autoriza na hora (já pode voltar `CONFIRMED`).
4. Asaas notifica `POST /api/webhooks/asaas` (valida `asaas-access-token`, responde
   200 rápido, dedup por `evt_id`). O **poller** cobre webhook perdido/fila interrompida.
5. Na transição para pago: pedido vira `pago`, assinatura materializa novo pedido,
   e (se `ASAAS_AUTO_LABEL=1`) gera etiqueta SmartEnvios.

## Segurança

- Chave da API **só no `.env`** — nunca vai ao navegador.
- Dados de cartão trafegam do front → backend → Asaas, **sem persistir nem logar**.
- Webhook autenticado por segredo compartilhado (`timingSafeEqual`).

## MCP

```
npm run mcp:asaas
```
Ferramentas: `asaas_config`, `asaas_create_payment`, `asaas_get_payment`,
`asaas_pix_qrcode`, `asaas_boleto_linha`, `asaas_refund`, `asaas_create_subscription`,
`asaas_cancel_subscription`, `asaas_create_payment_link`, `asaas_balance`,
`asaas_statement`, `asaas_list_webhooks`, `asaas_register_webhook`.

## Teste no sandbox

O sandbox não confirma pagamento por API — use o botão **"CONFIRMAR PAGAMENTO"** na
UI web do sandbox, que dispara os webhooks reais. Para o webhook alcançar o
localhost, use um túnel (ex: cloudflared) apontando pro `/api/webhooks/asaas` e
registre a URL com `POST /api/admin/payments/register-webhook`.
