# oneBackend

One backend project that runs **all 4 backends together on a single public port** through an
API gateway. Each backend keeps its **own database**, its own code, and its own routes — it is
simply reached under a unique path prefix.

```
                         ┌─────────────────────────────────────────────┐
                         │        oneBackend gateway  :4000            │  ← the ONE public port
   frontend ───────────▶│  (Express + http-proxy-middleware)          │
                         └───────┬───────┬───────┬───────┬─────────────┘
                                 │       │       │       │
        /aligaah/api/*   ────────┘       │       │       └──────── /underdwag/api/*
                   ▼                      │       │                        ▼
          aligaah  :5050          /crunz/api/*  /ezone/api/*        underdwag :5008
          DB: aligaah                 ▼           ▼                 DB: clothing
                                crunz :5006   ezone :5003
                                DB: crunz     DB: etrade
```

## What is where

| Service   | Public base URL (via gateway)     | Internal port | Module system | Database  | Payment  |
|-----------|-----------------------------------|---------------|---------------|-----------|----------|
| aligaah   | `http://localhost:4000/aligaah/api`   | 5050      | CommonJS      | `aligaah` | Razorpay |
| crunz     | `http://localhost:4000/crunz/api`     | 5006      | CommonJS      | `crunz`   | Stripe   |
| ezone     | `http://localhost:4000/ezone/api`     | 5003      | ES Modules    | `etrade`  | Razorpay |
| underdwag | `http://localhost:4000/underdwag/api` | 5008      | ES Modules    | `clothing`| Stripe   |

> **Note:** the classic port `5000` is used by macOS AirPlay Receiver (ControlCenter), so the
> gateway runs on **4000**. Change `GATEWAY_PORT` in `.env` to move it.

Each service still receives the exact `/api/...` paths it was written for — the gateway strips
the `/aligaah`, `/crunz`, `/ezone`, `/underdwag` prefix before forwarding. **No service code was
changed.** Static uploads are reachable the same way, e.g. `http://localhost:4000/crunz/uploads/...`.

## Folder layout

```
oneBackend/
├── gateway.js          # single public port, proxies each prefix to its service
├── package.json        # `npm start` runs the gateway + all 4 services together
├── .env                # GATEWAY_PORT + per-service targets
└── services/
    ├── aligaah/        # moved from  "Aligaah designs ecom/aligaah/backend"
    ├── crunz/          # moved from  "crunz_site 3/crunz-backend"
    ├── ezone/          # moved from  "ezoneshoppi/backend"
    └── underdwag/      # moved from  "underdwag/backend"
```

The original project folders now contain **frontend only**. Each frontend's
`NEXT_PUBLIC_API_URL` already points at its gateway path.

## Run everything

```bash
cd oneBackend
npm install        # first time only — installs the gateway's own deps
npm start          # starts the gateway + all 4 services (each with its own .env)
```

`npm run dev` does the same with hot-reload (nodemon).

Every service reads its **own** `.env` inside `services/<name>/` — databases, JWT secrets,
Cloudinary, Stripe/Razorpay keys, SMTP are unchanged from before.

### Run / debug a single service

```bash
npm run start:aligaah        # or start:crunz / start:ezone / start:underdwag
npm run gateway              # just the gateway
```

Each service can also still be run directly inside its own folder (`cd services/crunz && npm start`)
and is reachable on its internal port for debugging.

## Health checks

```bash
curl http://localhost:4000/                       # gateway index (lists all routes)
curl http://localhost:4000/aligaah/api/health
curl http://localhost:4000/crunz/api/health
curl http://localhost:4000/underdwag/api/health
curl http://localhost:4000/ezone/                 # ezone has no /health; root returns ok
```

## Moving a service to a different port

1. Change `PORT` in `services/<name>/.env`.
2. Change the matching `*_TARGET` in `oneBackend/.env`.
3. Restart `npm start`.

The public gateway port (4000) and every frontend URL stay the same.
