# Deploying Finance Tracker (SQLite, no PostgreSQL)

The app auto-detects the database to use:
- If `DATABASE_URL` env var is set → PostgreSQL
- Otherwise → **SQLite** stored at `DATA_DIR/finance_tracker.db`

Since Render's free web service filesystem resets on every deploy,
we mount a **persistent disk** at `/var/data` so the `.db` file survives.

---

## Deploy on Render (recommended — free tier works)

### One-time setup

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Blueprint**.
3. Connect your GitHub repo — Render will detect `render.yaml` automatically.
4. Fill in your `GROQ_API_KEY` in the Render dashboard (Environment tab).
5. Click **Deploy**.

The persistent disk (`/var/data`) is created automatically.
Your SQLite file lives at `/var/data/finance_tracker.db` and is never deleted.

### Key env vars

| Variable     | Value            | Notes                          |
|-------------|-----------------|-------------------------------|
| `DATA_DIR`  | `/var/data`     | Set by render.yaml already     |
| `SECRET_KEY`| auto-generated  | Set by render.yaml already     |
| `GROQ_API_KEY` | your key     | Fill in Render dashboard       |

> **Do NOT set `DATABASE_URL`** — that would switch it back to PostgreSQL.

---

## Run locally (phone via Termux, or PC)

```bash
# Install dependencies
pip install -r requirements.txt

# Run (SQLite auto-used, stored in ./data/finance_tracker.db)
uvicorn main:app --host 0.0.0.0 --port 8000
```

To change where the DB file is stored:
```bash
DATA_DIR=/path/to/safe/folder uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Backup your data

The SQLite file is a single portable file. To back it up:
```bash
# From Render shell (Dashboard → Shell tab):
cp /var/data/finance_tracker.db /var/data/finance_tracker.backup.db
```

Or download it locally:
```bash
scp user@your-render-ip:/var/data/finance_tracker.db ./backup.db
```
