# MegaCapacetes — Passo a passo

Arquitetura: **Supabase = só tabelas**. **Cloudflare = site + `/api/*`**.  
Não crie Edge Functions nem secrets no Supabase.

---

## 1. Banco no Supabase (projeto Capacetes19-08)

1. Abra o projeto no [supabase.com](https://supabase.com).
2. Vá em **SQL Editor → New Query**.
3. Cole **todo** o arquivo `supabase/migrations/20260819000000_pdf_backend_alignment.sql`.
4. Clique em **Run**.

Não rode o `schema.sql` separado. Esse arquivo já cria as tabelas.

5. Confira em **Table Editor** se existem: `orders`, `rastreio_origem`, `payment_gateways`, `notifications`, `comprovantes_taxa`, `user_roles`.

---

## 2. Usuário admin (login do painel `/xxx`)

1. **Authentication → Users → Add User**.
2. Email e senha fortes (ex: `admin@megacapacetes.store`).
3. Copie o **UUID** do usuário.
4. No SQL Editor:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('COLE-O-UUID-AQUI', 'admin');
```

---

## 3. Copiar as chaves do Supabase

Em **Project Settings → API**:

| Copiar | Colar no Cloudflare como |
|--------|--------------------------|
| Project URL | `SUPABASE_URL` e `VITE_SUPABASE_URL` |
| `anon` / publishable | `SUPABASE_ANON_KEY` e `VITE_SUPABASE_ANON_KEY` |
| `service_role` / secret | `SUPABASE_SERVICE_ROLE_KEY` |

A `service_role` não vai no frontend. Só no Cloudflare.

---

## 4. Deploy no Cloudflare

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**.
2. Conecte o repositório **MegaCapacetes** (Git).
3. Build:
   - **Build command:** `npm run build`
   - **Output directory:** `dist` (ou o que o vinext gerar; se o projeto já estiver no Worker, mantenha o mesmo projeto).
4. **Save and Deploy**.

Anote a URL pública, por exemplo:

`https://SEU-DOMINIO` ou `https://mega-capacetes.xxxx.workers.dev`

Essa URL é o `SITE_URL`.

---

## 5. Variáveis no Cloudflare (não no Supabase)

**Workers & Pages → seu projeto → Settings → Variables and Secrets** (Production).

Obrigatórias:

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL          (mesmo valor de SUPABASE_URL)
VITE_SUPABASE_ANON_KEY     (mesmo valor de SUPABASE_ANON_KEY)
SITE_URL                   (URL pública do passo 4, sem barra no final)
IRONPAY_API_TOKEN
IRONPAY_OFFER_HASH
IRONPAY_PRODUCT_HASH
RESEND_API_KEY
RESEND_FROM_EMAIL
CRON_SECRET
ADMIN_USER
ADMIN_PASS
ADMIN_SESSION_SECRET       (texto aleatório com 64+ caracteres)
```

Opcionais (se for usar):

```
VENUS_PAY_SECRET_KEY
VENUS_PAY_PRODUCT_ID
MASTERFY_API_KEY
UMBRELLAPAG_API_KEY
FB_PIXEL_ID
FB_ACCESS_TOKEN
UTMIFY_API_TOKEN
ENCRYPT_KEY
```

Depois de salvar, **faça um novo deploy** (as vars só entram no próximo build/deploy).

---

## 6. KV de rate limit PIX

1. Cloudflare → **Workers & Pages → KV**.
2. **Create namespace** → nome: `pix-ratelimit`.
3. No projeto da loja → **Settings → Bindings** → Add:
   - Tipo: **KV Namespace**
   - Variable name: `PIX_RATELIMIT`
   - Namespace: `pix-ratelimit`
4. Deploy de novo.

Limite: 5 gerações de PIX por IP por hora.

---

## 7. Webhook do PIX

No painel da IronPay (e nos outros PIX, se usar):

```
https://SEU-DOMINIO/api/pix/webhook
```

Troque `SEU-DOMINIO` pelo `SITE_URL` real.

Venus Pay PIX: cadastre o mesmo webhook no painel da Venus, se for usar.

---

## 8. E-mail (Resend)

1. Conta em [resend.com](https://resend.com).
2. Verifique o domínio (SPF + DKIM).
3. API Key → `RESEND_API_KEY`.
4. Remetente → `RESEND_FROM_EMAIL` (ex: `contato@megacapacetes.store`).

---

## 9. Cron de carrinho abandonado

1. Conta em [cron-job.org](https://cron-job.org).
2. Novo job:
   - Método: **POST**
   - URL: `https://SEU-DOMINIO/api/process-recovery-queue`
   - Header: `x-cron-secret` = o mesmo valor de `CRON_SECRET`
   - Intervalo: **a cada 15 minutos**

---

## 10. Testar

1. Home da loja abre com os produtos.
2. Carrinho → checkout → PIX gera QR / copia-e-cola.
3. Pague um PIX de teste → pedido vira pago e gera código `MC…`.
4. Abra `/rastrear-pedido?codigo=CODIGO`.
5. Confira o e-mail de rastreio.
6. Admin: `https://SEU-DOMINIO/admin` (vai para `/xxx`) com o usuário do passo 2.
7. No admin, aba Gateways: um PIX ativo por vez; cartão Venus independente.
8. Se Venus estiver ativo e com credencial, o checkout mostra cartão.

Teste rápido da API:

```bash
curl -X POST https://SEU-DOMINIO/api/pix/create ^
  -H "Content-Type: application/json" ^
  -d "{\"amount\":9.9,\"customer\":{\"name\":\"Teste\",\"email\":\"teste@teste.com\",\"cpf\":\"12345678909\",\"phone\":\"11999999999\"},\"items\":[{\"name\":\"Teste\",\"quantity\":1,\"price\":9.9}]}"
```

---

## Checklist

- [ ] SQL rodou sem erro
- [ ] Admin criado em `user_roles`
- [ ] Vars no Cloudflare + redeploy
- [ ] KV `PIX_RATELIMIT` ligado
- [ ] Webhook `/api/pix/webhook`
- [ ] Resend com domínio verificado
- [ ] Cron a cada 15 min
- [ ] `SITE_URL` igual à URL final
- [ ] PIX, rastreio, admin e e-mail ok

---

## Se algo falhar

| Problema | O que checar |
|----------|----------------|
| PIX não gera QR | Gateway ativo no admin + `IRONPAY_*` no Cloudflare + redeploy |
| Webhook não marca pago | `SITE_URL` e URL do webhook iguais ao domínio final |
| Rastreio não acha o código | Código precisa existir em `orders` **e** `rastreio_origem` |
| Admin não loga | Usuário no Auth + linha em `user_roles` |
| E-mail não chega | DNS do Resend (SPF/DKIM) |
| Loja usa banco antigo | `VITE_SUPABASE_URL` / `SUPABASE_URL` apontando para **Capacetes19-08** |
