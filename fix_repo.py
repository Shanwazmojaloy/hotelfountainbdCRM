#!/usr/bin/env python3
"""
Hotel Fountain CRM — GitHub Repo Fix Script
Run: python3 fix_repo.py YOUR_GITHUB_TOKEN
Get token at: https://github.com/settings/tokens (need repo scope)
"""
import sys, base64, json
import urllib.request, urllib.error

OWNER = 'Shanwazmojaloy'
REPO = 'hotelfountainbd'
BRANCH = 'main'

def api(path, method='GET', body=None, token=''):
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/{path}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('User-Agent', 'HotelFountain-CRM-Fix')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code

def get_sha(path, token):
    d, status = api(f'contents/{path}?ref={BRANCH}', token=token)
    return d.get('sha') if status == 200 else None

def put_file(path, content, token):
    sha = get_sha(path, token)
    body = {'message': f'fix: clean Vite build for {path}', 'content': content, 'branch': BRANCH}
    if sha:
        body['sha'] = sha
    d, status = api(f'contents/{path}', 'PUT', body, token)
    return status in (200, 201)

def b64(s):
    return base64.b64encode(s.encode('utf-8')).decode('utf-8')

if __name__ == '__main__':
    token = sys.argv[1] if len(sys.argv) > 1 else input('GitHub token: ').strip()
    
    FILES = {
        'package.json': '''{
  "name": "hotel-fountain-crm",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0"
  }
}''',
        'vercel.json': '''{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}''',
        'vite.config.js': """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 }
})
""",
        'index.html': """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Hotel Fountain — Management CRM</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏨</text></svg>"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@200;300;400;500&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body,#root{height:100%;overflow:hidden;background:#07090E}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>""",
        '.gitignore': 'node_modules\ndist\n.DS_Store\n*.local\n.env',
        'src/main.jsx': """import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
""",
    }
    
    print(f"\nFixing repo: {OWNER}/{REPO} (branch: {BRANCH})")
    print("=" * 50)
    
    ok = 0
    for path, content in FILES.items():
        result = put_file(path, b64(content), token)
        status = '✓' if result else '✗'
        print(f"  {status} {path}")
        if result: ok += 1
    
    print(f"\n{ok}/{len(FILES)} files updated")
    print("Vercel will auto-deploy in ~30 seconds → https://hotelfountainbd.vercel.app")
