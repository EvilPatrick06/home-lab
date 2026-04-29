# Dungeon Scholar

A D&D-themed study app built with React + Vite.

**Live site:** `https://YOUR-USERNAME.github.io/dungeon-scholar/` (after you deploy)

---

## One-time setup on Pop!_OS

Install Node 20 if you don't have it:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # should print v20.x.x
```

## Run it locally first

```bash
npm install
npm run dev
```

Open http://localhost:5173 — make sure it works before deploying.

## Deploy to GitHub Pages

1. **Make a new public repo** on GitHub. The repo name will be in your URL, so pick something you like (e.g. `dungeon-scholar`).

2. **Update the base path** in `vite.config.js` to match your repo name. If your repo is `dungeon-scholar`, leave it; if you named it something else, change `'/dungeon-scholar/'` to `'/<your-repo-name>/'`. The leading and trailing slashes both matter.

3. **Push the project:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

4. **Enable Pages:** in your repo on GitHub, go to **Settings → Pages → Build and deployment → Source** and pick **GitHub Actions**. (You only do this once per repo.)

5. **Watch the deploy:** the workflow runs automatically. Check the **Actions** tab — first build takes about 60–90 seconds. When it goes green, your site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

From now on, every push to `main` redeploys automatically.

## Troubleshooting

**Blank page after deploy?** Almost always the `base` path in `vite.config.js` doesn't match your repo name. Fix it, commit, push.

**Tailwind classes not applying?** Make sure `index.css` is imported in `main.jsx` (it already is in this scaffold).

**Build fails in Actions but works locally?** Run `npm run build` locally — the same error will show up. Often it's a missing import or a TS-flavored syntax that Vite doesn't strip.

## Project structure

```
dungeon-scholar/
├── .github/workflows/deploy.yml   # auto-deploy on push
├── src/
│   ├── App.jsx                    # your app (4784 lines)
│   ├── main.jsx                   # React entry point
│   └── index.css                  # Tailwind directives
├── index.html
├── package.json
├── vite.config.js                 # base path lives here
├── tailwind.config.js
└── postcss.config.js
```
