# 🪖 MegaCapacetes — Guia de Setup do Backend

Este guia explica como configurar o backend completo do MegaCapacetes.  
O **frontend já está compilado** em `public/assets/` — não precisa tocar nele.

---

## 📋 Visão Geral da Arquitetura

| Camada | Tecnologia | O que faz |
|--------|-----------|-----------|
| Frontend | React (compilado) | Loja, checkout, admin, rastreio |
| Banco de dados | Supabase (PostgreSQL) | Pedidos, rastreio, notificações |
| Backend | Supabase Edge Functions | PIX, emails, Facebook, UTMify |
| Hospedagem | Cloudflare Pages | Serve o site estático |
| PIX | IronPay | Gateway de pagamento |
| Email | Resend | Confirmações e rastreio |

---

## PASSO 1 — Configurar o Supabase

### 1.1 Criar o banco de dados

1. Acesse [supabase.com](https://supabase.com) → seu projeto
2. Vá em **SQL Editor** → clique em **New Query**
3. Cole **todo o conteúdo** do arquivo `supabase/schema.sql`
4. Clique em **Run** (▶️)

✅ Isso cria todas as tabelas: `orders`, `orders_status`, `rastreio_origem`, `notifications`, `payment_gateways`, `pix_errors`, `price_overrides`, `user_roles`

### 1.2 Criar o usuário admin

1. Vá em **Authentication → Users → Add User**
2. Email: `admin@megacapacetes.store` (ou o que preferir)
3. Password: crie uma senha forte
4. Após criar, copie o **UUID** do usuário
5. No **SQL Editor**, execute:
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('COLE-O-UUID-AQUI', 'admin');
```

### 1.3 Deploy das Edge Functions

No terminal, com [Supabase CLI](https://supabase.com/docs/guides/cli) instalado:

```bash
# Instalar CLI (se não tiver)
npm install -g supabase

# Login
supabase login

# Link com seu projeto (pegue o Project ID em: Settings > General)
supabase link --project-ref SEU_PROJECT_ID

# Deploy de todas as Edge Functions de uma vez
supabase functions deploy checkout-create-pix
supabase functions deploy admin
supabase functions deploy orders
supabase functions deploy send-tracking-email
supabase functions deploy pix-webhook
supabase functions deploy fb-purchase
supabase functions deploy utmify-order
supabase functions deploy checkout
```

### 1.4 Configurar secrets das Edge Functions

No **Supabase Dashboard → Settings → Edge Functions → Manage Secrets**, adicione:

| Secret | Valor |
|--------|-------|
| `SUPABASE_URL` | URL do seu projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key do Supabase |
| `SUPABASE_ANON_KEY` | Anon Key do Supabase |
| `IRONPAY_API_TOKEN` | Token da IronPay |
| `IRONPAY_OFFER_HASH` | Hash da oferta IronPay |
| `IRONPAY_PRODUCT_HASH` | Hash do produto IronPay |
| `RESEND_API_KEY` | API Key da Resend |
| `RESEND_FROM_EMAIL` | Ex: `contato@megacapacetes.store` |
| `FB_PIXEL_ID` | ID do Pixel do Facebook |
| `FB_ACCESS_TOKEN` | Token CAPI do Facebook |
| `UTMIFY_API_TOKEN` | Token da UTMify |

---

## PASSO 2 — Configurar o Cloudflare Pages

### 2.1 Criar o projeto no Cloudflare Pages

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages**
2. Clique em **Create a project → Connect to Git**
3. Conecte o repositório `MegaCapacetes`
4. Configure o build:
   - **Framework preset**: None (ou Next.js)
   - **Build command**: `npm run build`
   - **Build output directory**: `.next` (ou `dist`)

### 2.2 Configurar Variáveis de Ambiente no Cloudflare Pages

Vá em **Settings → Environment Variables** e adicione:

| Variável | Valor |
|----------|-------|
| `VITE_SUPABASE_URL` | URL do Supabase (ex: `https://xxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Anon Key do Supabase |

> ⚠️ **Atenção**: O frontend já foi pré-compilado com as URLs do Supabase. Se o projeto foi compilado com URLs diferentes, você precisará recompilar o frontend com as novas URLs.

---

## PASSO 3 — Configurar Webhook IronPay

No painel da IronPay, configure a URL de webhook:

```
https://SEU_PROJETO.supabase.co/functions/v1/pix-webhook
```

Isso é necessário para que os pagamentos PIX sejam confirmados automaticamente.

---

## PASSO 4 — Testar

### Testar a geração de PIX:
```bash
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/checkout-create-pix \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.90,
    "customer": {
      "name": "Teste Cliente",
      "email": "teste@teste.com",
      "cpf": "123.456.789-09",
      "phone": "(11) 99999-9999"
    },
    "items": [{"name": "Capacete Teste", "quantity": 1, "price": 99.90}],
    "shippingAddress": {
      "cep": "01310-100",
      "address": "Av. Paulista",
      "number": "1000",
      "neighborhood": "Bela Vista",
      "city": "São Paulo",
      "state": "SP"
    }
  }'
```

### Testar rastreio:
```bash
curl https://megacapacetes.store/rastrear-pedido?codigo=MCTESTE01
```

---

## 📁 Estrutura dos Arquivos de Backend

```
supabase/
├── schema.sql                         ← ⭐ RODE ISSO PRIMEIRO no SQL Editor
├── config.toml                        ← Config do Supabase CLI
└── functions/
    ├── checkout-create-pix/index.ts   ← Cria pedido + gera PIX (IronPay)
    ├── admin/index.ts                 ← Painel admin (listagem, status, rastreio)
    ├── orders/index.ts                ← Consulta pública de pedidos e rastreio
    ├── checkout/index.ts              ← Abandono de carrinho e recuperação
    ├── send-tracking-email/index.ts   ← Email com código de rastreio (Resend)
    ├── pix-webhook/index.ts           ← Webhook IronPay (PIX pago → atualiza)
    ├── fb-purchase/index.ts           ← Evento Purchase no Facebook CAPI
    └── utmify-order/index.ts          ← Relatório de vendas na UTMify
```

---

## ⚠️ Regras críticas (Supabase)

1. **Nunca use `.update()` com `.order()` ou `.limit()`** — causa falha silenciosa  
   ✅ Sempre: SELECT o `id` primeiro → UPDATE por `id`

2. **Código de rastreio salvo em DUAS tabelas**: `orders.codigo_rastreio` + `rastreio_origem`

3. **Service Role Key nunca vai pro frontend** — somente nas Edge Functions

---

## 🔧 Fluxo de Pagamento PIX

```
Cliente preenche checkout
       ↓
Redireciona para /pix (dados no sessionStorage)
       ↓
PixPage chama supabase.functions.invoke("checkout-create-pix")
       ↓
Edge Function cria pedido no banco + chama IronPay
       ↓
Retorna QR Code e Copia-e-Cola para o frontend
       ↓
Cliente paga → IronPay chama webhook /pix-webhook
       ↓
Webhook: marca pago + gera rastreio MC + envia email + FB + UTMify
       ↓
Frontend detecta via Realtime → redireciona para sucesso
```

---

## 🛡️ Acesso Admin

1. Acesse: `https://megacapacetes.store/admin`
2. Login com o email/senha criados no Passo 1.2
3. O admin pode:
   - Ver todos os pedidos com filtros
   - Marcar pedidos como pagos (gera rastreio automático)
   - Enviar email de rastreio manualmente
   - Gerar/editar código de rastreio
   - Ver estatísticas (total, faturamento, hoje)
