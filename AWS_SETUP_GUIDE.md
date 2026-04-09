# AWS Setup Guide — DnD VTT CI/CD & Security Scanning

Browser-only. No AWS CLI needed.

---

## Prerequisites

- AWS account with ~$100 credit
- GitHub repo: `EvilPatrick06/DnD` on `master` branch
- `buildspec.yml` already committed to repo root (done by Claude)

---

## Step 1 — Create GitHub Connection (do this first, others depend on it)

1. Open **AWS Console** → search `CodePipeline` → click it
2. Left sidebar → **Settings** → **Connections**
3. Click **Create connection**
4. Provider: **GitHub** → Connection name: `github-evilpatrick06` → **Connect to GitHub**
5. Click **Authorize AWS Connector for GitHub**
6. Click **Install a new app**
7. Select account `EvilPatrick06` → **Only select repositories** → select `DnD` → **Install**
8. Click **Connect**
9. Verify: status shows **Available** (green)

---

## Step 2 — Amazon Q Developer (Free Security Scanning)

**Cost: Free tier, no charge**

1. Console → search `Amazon Q Developer` → click it
2. Click **Get started** → select **Individual** tier (free) → accept terms
3. Left sidebar → **Code reviews** → **Create code review**
4. Source: **GitHub** → Connection: `github-evilpatrick06`
5. Repository: `EvilPatrick06/DnD` → Branch: `master`
6. Scan type: **Full repository scan**
7. Click **Start review**
8. Wait 5–15 min → results show: severity, file path, line number, CWE class, fix suggestions

**Repeat**: Run a new scan after any security-related code changes.

---

## Step 3 — CodeBuild CI Project

**Cost: ~$0.005/min on free tier instance. ~100 free build minutes/month.**

1. Console → search `CodeBuild` → click it
2. Click **Create build project**

### Project configuration
- **Project name**: `dnd-vtt-ci`
- **Description**: `CI - lint, typecheck, audit, test`

### Source
- Source provider: **GitHub**
- Click **Connect using OAuth** or **Connect with a GitHub personal access token** OR use **AWS CodeConnections**
- Select connection: `github-evilpatrick06`
- Repository: `EvilPatrick06/DnD`
- Branch: `master`
- Clone depth: `1`

### Primary source webhook events
- Check **Rebuild every time a code change is pushed to this repository**
- Add filter group:
  - Event type: **PUSH**
- Add second filter group:
  - Event type: **PULL_REQUEST_CREATED**
- Add third filter group:
  - Event type: **PULL_REQUEST_UPDATED**

### Environment
- Environment image: **Managed image**
- Compute: **EC2**
- Operating system: **Ubuntu**
- Runtime: **Standard**
- Image: **aws/codebuild/standard:7.0**
- Image version: **Always use the latest image for this runtime version**
- Environment type: **Linux EC2**
- Compute type: **3 GB memory, 2 vCPUs** (BUILD_GENERAL1_SMALL — free tier eligible)
- Service role: **New service role** (auto-named)
- Leave **Privileged** unchecked

### Buildspec
- Select **Use a buildspec file**
- Leave filename blank (uses `buildspec.yml` from repo root)

### Artifacts
- Type: **No artifacts**

### Logs
- CloudWatch Logs: **Enabled**
- Group name: `/codebuild/dnd-vtt-ci`
- Stream name: leave blank

3. Click **Create build project**
4. Click **Start build** to test — watch logs in real time

**Build phases** (from `buildspec.yml`):
- `npm ci --ignore-scripts` — install deps
- `npm run lint` — Biome linting
- `npx tsc --noEmit` — TypeScript type check
- `npx knip --no-exit-code || true` — dead code (informational)
- `npx madge --circular src/` — circular dependency check
- `npm audit --audit-level=critical` — security audit
- `npm test` — full Vitest suite (630 files, 6000+ tests)

---

## Step 4 — CodePipeline (Auto-trigger on push to master)

**Cost: 1 active pipeline = $1/month. First pipeline free for 30 days.**

1. Console → search `CodePipeline` → click it
2. Click **Create pipeline**

### Pipeline settings
- Pipeline name: `dnd-vtt-pipeline`
- Pipeline type: **V2**
- Execution mode: **Queued** (runs one at a time, queues pushes)
- Service role: **New service role** (auto-named)
- Click **Next**

### Add source stage
- Source provider: **GitHub (via GitHub App)** or **GitHub (Version 2)**
- Connection: `github-evilpatrick06`
- Repository name: `EvilPatrick06/DnD`
- Default branch: `master`
- Trigger: **Push to a branch**
- Click **Next**

### Add build stage
- Build provider: **AWS CodeBuild**
- Region: your current region (e.g. `us-east-1`)
- Project name: `dnd-vtt-ci` (the project you just created)
- Build type: **Single build**
- Click **Next**

### Add deploy stage
- Click **Skip deploy stage** → confirm skip

### Review
- Review all settings → click **Create pipeline**
- Pipeline runs immediately on the latest master commit

**Result**: Every `git push` to master triggers the pipeline. Build logs visible in CodeBuild console.

---

## Step 5 — Verify Everything Works

### Trigger a test build
```
# Make a tiny change and push
git commit --allow-empty -m "test: trigger CI"
git push origin master
```

### Check results
- **CodePipeline**: Console → CodePipeline → `dnd-vtt-pipeline` → see stage status
- **CodeBuild**: Console → CodeBuild → `dnd-vtt-ci` → Build history → click latest → Phase details + logs
- **Amazon Q**: Console → Amazon Q Developer → Code reviews → see findings list

---

## Cost Estimates

| Service | Usage | Est. Cost |
|---|---|---|
| Amazon Q Developer | Individual tier | Free |
| CodeBuild | ~50 builds/month × 8 min avg | ~$2/month |
| CodePipeline | 1 active pipeline | $1/month (free first 30 days) |
| CloudWatch Logs | Build logs | <$0.50/month |
| **Total** | | **~$3.50/month** |

With $100 credit: ~28 months of CI/CD.

---

## Troubleshooting

**Build timeout**: Switch compute to `BUILD_GENERAL1_MEDIUM` (4 vCPU, 7 GB) in project settings.

**Region**: Use `us-east-1` (us-east-1 has broadest service availability).

**GitHub connection fails**: Re-authorize in Settings → Connections → delete and recreate.

**npm ci fails**: Check `ELECTRON_SKIP_BINARY_DOWNLOAD=1` is set in buildspec.yml env vars.

**knip/madge false positives**: Add `knip.json` config file to repo root to exclude known patterns.

**Tests timeout on CodeBuild**: Increase `testTimeout` in `vitest.config.ts`.
