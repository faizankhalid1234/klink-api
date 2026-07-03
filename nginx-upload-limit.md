# nginx upload limit for direct n8n webhook (optional)

If you POST large files directly to n8n (`/webhook/kling/avatar/generate`),
nginx must allow larger request bodies. Add inside your `server { }` block:

```nginx
client_max_body_size 50M;
```

Then reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Note:** The Vercel app (`/api/generate`) uploads files to fal.ai storage first and
sends only small JSON URLs to n8n, so this nginx change is optional when using the
Vercel page.
