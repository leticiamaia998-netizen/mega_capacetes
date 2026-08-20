# MegaCapacetes

Loja no Cloudflare Worker. O banco fica no Supabase (só tabelas). Pagamentos, e-mail e admin passam por `/api/*`.

## Pastas

```
app/            páginas da loja, rastreio, sucesso e rotas /api/*
lib/store/      PIX, cartão, e-mail, rastreio, Supabase
public/         vitrine compilada, imagens e scripts de cartão/admin
supabase/       SQL das tabelas (rode no SQL Editor)
worker/         entrada do Cloudflare
scripts/        build do deploy
```

O que **não** entra neste repo: Edge Functions do Supabase, D1, Drizzle, exemplos do template.

Passo a passo de chaves e deploy: `SETUP.md`.
