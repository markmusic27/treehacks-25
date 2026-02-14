# Run the Maestro app

Open PowerShell and run these commands **one by one**:

```powershell
cd "C:\Users\gba09\OneDrive\Bureau\duolingo-style-webpage"
npm install
npm run dev
```

Then open in your browser: **http://localhost:3000**

---

### Instructor chat (Pick & Play) — OpenAI / ChatGPT

When you **pause** during a session, you can talk to your instructor like a real personal coach. This uses the **OpenAI API** (ChatGPT):

1. Get an API key: [OpenAI API keys](https://platform.openai.com/api-keys) → Create new secret key.
2. In the **project folder**, create or edit **`.env.local`** and add:
   ```
   OPENAI_API_KEY=sk-proj-xxxxx...
   ```
3. Save, then **restart** the dev server (Ctrl+C, then `npm run dev`).

### Optional: Learn & Grow (artist/instrument info) — Anthropic

For Claude-powered artist and instrument info in Learn & Grow, add to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Note:** `.env.local` must be in the project root. Restart the dev server after any change.

---

**Why:** `npm install` and `npm run dev` must be run from the folder that contains `package.json` (the project folder). Your prompt was at `C:\Users\gba09\`, so npm looked for `package.json` there and didn’t find it.
