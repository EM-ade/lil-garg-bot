# Lil Garg Vercel Proxy

Simple static site with Vercel rewrites to proxy HTTPS requests to Orihost backend.

## Deploy

```bash
vercel --prod
```

That's it! No build needed.

## Usage

Update your frontend API calls to use:
```javascript
const API_URL = 'https://your-app.vercel.app';
```

Instead of:
```javascript
const API_URL = 'http://2.56.246.119:30391';
```

## How it works

- Vercel serves the static `index.html` at the root
- All `/api/*` requests are proxied to `http://2.56.246.119:30391/api/*`
- Vercel provides free HTTPS with automatic SSL certificates
