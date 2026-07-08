# klink-api

InfiniTalk avatar proxy API + upload page.

## Endpoints

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/avatar/create` | Create Kie `infinitalk/from-audio` task |
| POST | `/api/avatar/upload` | Upload portrait/audio file (proxies to Kie) |
| GET | `/api/avatar/status?taskId=...` | Poll task — returns full Kie response |

## Vercel env (required)

```
KIE_API_KEY=your_kie_api_key_here
```

Optional:

```
KLINK_API_SECRET=your_custom_secret
```

If `KLINK_API_SECRET` is set, send header `x-api-key` from n8n.

## Deploy

Push to GitHub → Vercel auto-deploys to `https://klink-api-five.vercel.app`

## n8n workflow

`Kie InfiniTalk From Audio` calls this API — **no Kie key inside n8n**.
