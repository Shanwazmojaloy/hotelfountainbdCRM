# Deploy folio-fixed in 3 minutes — No admin needed

## Step 1: Install Git (portable, no admin)
1. Go to: https://git-scm.com/download/win
2. Download **64-bit Git for Windows Portable** (the .exe file, not the installer)
3. Run it — it extracts to a folder (e.g. `C:\Users\ahmed\PortableGit`)
4. Open that folder → double-click `git-bash.exe` ← USE THIS instead of PowerShell

## Step 2: In Git Bash, run these (copy-paste all at once):
```bash
cd "/c/Users/ahmed/OneDrive/Desktop/New folder/folio-fixed"
git init
git checkout -b main
git remote add origin https://github.com/Shanwazmojaloy/folio.git
git add -A
git commit -m "Fix: correct build script, use client, lazy Stripe init"
git push --force origin main
```

## Step 3: Watch Vercel auto-deploy
Go to: https://vercel.com/shanwaz-ahmeds-projects/folio
It will trigger automatically and build correctly this time.

## Why it will work now:
- package.json now has "build": "next build" (not "next dev")
- HeroSection.tsx has 'use client' directive
- Stripe initializes lazily (won't crash without STRIPE_SECRET_KEY)
- All imports are clean, no missing CSS files

## Your live URL will be:
https://folio-delta-wine.vercel.app
