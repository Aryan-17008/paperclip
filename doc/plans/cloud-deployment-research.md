# Cloud Deployment Research for Paperclip

## Objective
Evaluate cloud deployment options for hosting Paperclip (Next.js + PostgreSQL + Node.js/Express API)

## Current Stack
- Frontend: Next.js 16 (React + Vite in dev)
- Backend: Express REST API (Node.js/TypeScript)
- Database: PostgreSQL (embedded PGlite in dev, need managed in prod)
- AI Integration: Kimi K2.5 via API
- Deployment: Currently local/WSL only

## Cloud Providers Comparison

### AWS (Amazon Web Services)

**Compute Options:**
- **EC2** — Full control, cheapest for always-on, ~$15-50/mo for t3.small/t3.medium
- **Lightsail** — Simpler, $5-40/mo, good for small projects
- **Elastic Beanstalk** — Managed platform, auto-scaling, ~$20-100/mo
- **ECS/Fargate** — Containerized, serverless containers, pay per use

**Database:**
- **RDS PostgreSQL** — Managed DB, ~$15-50/mo for db.t3.micro (single AZ)
- **RDS Serverless v2** — Auto-scaling, pay per ACU-hour, good for variable load

**Pros:**
- Most mature ecosystem
- Free tier available (750 hrs EC2 t2.micro, 750 hrs RDS db.t2.micro for 12 months)
- Extensive documentation
- S3 for file storage if needed

**Cons:**
- Complex pricing (egress fees, data transfer)
- Steep learning curve
- Overwhelming number of services

**Estimated Cost (small scale):** $20-60/mo

---

### Google Cloud Platform (GCP)

**Compute Options:**
- **Cloud Run** — Serverless containers, pay per request, scales to zero, ~$0-10/mo for low traffic
- **Compute Engine** — VMs, similar to EC2, ~$15-50/mo
- **App Engine** — Managed platform, ~$20-80/mo

**Database:**
- **Cloud SQL (PostgreSQL)** — Managed DB, ~$15-40/mo for db-f1-micro
- **Cloud SQL Serverless** — Not available (only MySQL has serverless option)

**Pros:**
- Cloud Run is excellent for Next.js (scales to zero = $0 when idle)
- Generous free tier (1 f1-micro instance always free, 28 hrs Cloud Run free)
- Good AI/ML integrations
- Simpler pricing than AWS

**Cons:**
- Smaller ecosystem than AWS
- Cloud SQL can be expensive for small instances
- Less third-party tooling

**Estimated Cost (small scale):** $10-40/mo (Cloud Run + Cloud SQL)

---

### Azure

**Compute Options:**
- **App Service** — Managed platform, ~$15-70/mo
- **Container Instances** — Simple containers, ~$15-50/mo
- **AKS** — Kubernetes, overkill for small projects

**Database:**
- **Azure Database for PostgreSQL** — Managed DB, ~$15-50/mo
- **Flexible Server** — Good for dev/test, ~$10-30/mo

**Pros:**
- Good Windows integration (relevant since user uses Windows)
- Free tier (750 hrs B1s VM, 250 GB SQL for 12 months)
- Good for .NET/Windows stacks

**Cons:**
- Less popular for Node.js/Next.js
- Portal can be slow
- Smaller community for troubleshooting

**Estimated Cost (small scale):** $20-60/mo

---

### Alternative: Railway / Render / Fly.io

**Railway:**
- Managed platform, very simple deployment from GitHub
- PostgreSQL included
- ~$5-20/mo for small projects
- Auto-scaling, PR previews
- Best for: Rapid deployment, small teams

**Render:**
- Similar to Railway
- Free tier available (web services, PostgreSQL)
- ~$7-25/mo for paid plans
- Good for: Side projects, quick prototypes

**Fly.io:**
- Runs containers close to users (edge deployment)
- ~$2-20/mo for small apps
- PostgreSQL available (managed)
- Good for: Global apps, low latency requirements

---

## Recommendation for Paperclip

### Phase 1: Development / Testing (Now)
**Railway or Render**
- Easiest deployment from GitHub
- Built-in PostgreSQL
- Auto-deploy on push
- Cost: $0-15/mo (free tier or minimal paid)
- Time to deploy: < 30 minutes

### Phase 2: Production (Later)
**GCP Cloud Run + Cloud SQL**
- Cloud Run scales to zero (cost $0 when not in use)
- Cloud SQL for managed PostgreSQL
- Good balance of cost and control
- Cost: $15-40/mo for consistent low traffic
- Can use Cloud Build for CI/CD

### Phase 3: Scale (If needed)
**AWS ECS Fargate + RDS**
- More control over infrastructure
- Better for high traffic
- Cost: $50-200/mo depending on load

---

## Containerization Steps (Required for all cloud options)

1. **Create Dockerfile** for server + UI
2. **Docker Compose** for local testing with PostgreSQL
3. **Environment variables** for production (DATABASE_URL, KIMI_API_KEY, etc.)
4. **Database migrations** on startup
5. **Health check endpoint** already exists (`/api/health`)

---

## CI/CD Pipeline (GitHub Actions)

1. **Build** — `pnpm install`, `pnpm build`, `pnpm typecheck`
2. **Test** — `pnpm test:run`
3. **Docker build** — Build and push to registry (GHCR, GCR, ECR)
4. **Deploy** — Trigger Railway/Render deploy or update Cloud Run/ECS

---

## Next Steps

1. [ ] Create Dockerfile for Paperclip
2. [ ] Set up Docker Compose for local testing
3. [ ] Choose platform (recommend Railway for quick start)
4. [ ] Set up GitHub Actions for CI/CD
5. [ ] Configure environment variables for production
6. [ ] Test deployment with staging instance

## Estimated Time
- Dockerfile + Compose: 2-3 hrs
- Platform setup: 1-2 hrs
- CI/CD pipeline: 2-3 hrs
- Testing + fixes: 2-3 hrs
- **Total: 7-11 hrs**
