# Observability Stack (Prometheus / Grafana / Loki)

This project includes a local observability stack in `docker-compose.yml` under the services:

- `prometheus` (9090)
- `grafana` (3001)
- `loki` (3100)
- `promtail` (9080)

There is also a `monitoring/` directory with example configs:

- `monitoring/prometheus.yml` — Prometheus scrape config (scrapes the app at `/metrics`).
- `monitoring/loki-config.yml` — Loki server config.
- `monitoring/promtail-config.yml` — Promtail config to collect Docker container logs and push to Loki.
- `monitoring/grafana/provisioning/datasources/datasources.yml` — Grafana provisioning for Prometheus and Loki.

Quick start (requires Docker & Docker Compose):

```bash
# From repository root
docker-compose up -d

# Wait a minute for services to start, then open dashboards:
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (user: admin / password: admin123)
# Loki (API): http://localhost:3100
```

Where to find metrics and logs

- Application metrics are exposed on the app at `GET /metrics` and are scraped by Prometheus (configured in `monitoring/prometheus.yml`). Prometheus scrapes the `app:4000` target in the compose network.
- Application logs are printed in structured JSON using `pino` (see `src/app/middlewares/requestLogger.ts`). `promtail` is configured to scrape Docker container logs and push them to Loki.
- Use Grafana to build dashboards that combine Prometheus metrics and Loki logs. The provisioning already creates Prometheus and Loki data sources at startup.

Environment & notes

- The `app` container loads environment variables from `.env`. Ensure the following variables are set before starting the stack (see `.env.example` for examples):
  - `MONGO_ROOT_PASSWORD`, `MONGO_DB`
  - `REDIS_PASSWORD`
  - Stripe-related: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`

- The Docker Compose file mounts the project directory into the `app` container. In development the app runs with `npm run dev` and logs will be available to Promtail.

Troubleshooting

- If Prometheus can't scrape the app, verify the app is listening on port `4000` inside the compose network and that `/metrics` returns metrics (visit `http://localhost:4000/metrics` or via `docker-compose exec app curl -s http://localhost:4000/metrics`).
- If logs do not appear in Grafana Explore → Loki, check `promtail` container logs (`docker-compose logs -f promtail`) for scrape errors and ensure `/var/run/docker.sock` is mounted and readable.

Next steps (optional)

- Add example Grafana dashboards for key metrics (request latency, request rate, subscription creation rate, webhook failures).
- Add Prometheus alerting rules and wire Alertmanager.
- Configure secure Grafana credentials and persist dashboards.

If you want, I can add sample Grafana dashboards and Prometheus alerting rules next.
