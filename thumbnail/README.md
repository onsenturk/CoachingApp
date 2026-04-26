# YouTube Thumbnail

Two ways to use this.

## Option A — Screenshot the HTML (fastest, full control)

1. Drop a head-and-shoulders photo of yourself (transparent background ideal) next to `thumbnail.html` and name it `face.png`.
   - Quick way to remove background: <https://www.remove.bg> or Photos app on Windows 11.
2. Open `thumbnail.html` in Chrome/Edge.
3. Capture exactly 1280×720:

   **PowerShell + headless Chrome (recommended):**

   ```powershell
   # From repo root
   $chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
   & $chrome --headless --disable-gpu --hide-scrollbars `
     --window-size=1280,720 `
     --screenshot="$PWD\thumbnail\thumbnail.png" `
     "file:///$($PWD.Path -replace '\\','/')/thumbnail/thumbnail.html"
   ```

   Or use the browser DevTools device toolbar set to 1280×720 and "Capture screenshot".

4. Tweak text/colors in `thumbnail.html` (search for `headline`, `kicker`, `sub`).

## Option B — Generate with an AI image tool

Paste this into **DALL·E 3 (ChatGPT)**, **Bing Image Creator**, **Midjourney**, or **Gemini**:

> A bold, high-contrast YouTube thumbnail, 1280x720, cinematic lighting. Dark navy gradient background with a glowing Strava-orange (#FC4C02) radial glow on the right. On the right: a confident male developer in his 30s, head and shoulders, slight smile, wearing a casual hoodie, looking straight at the camera, dramatic rim light. On the left: huge bold sans-serif headline "AI RUNNING COACH" in white with the word "AI" in Strava orange, with a smaller kicker "I BUILT IT IN A WEEKEND" in an orange tag above it. Floating glossy 3D logo chips around the developer for Strava (orange), OpenAI (green spiral), VS Code (blue), and GitHub Copilot (purple). Subtle code grid pattern overlay. Clean, modern, tech-influencer YouTube style, sharp focus, vivid colors, no extra text, no watermarks.

Aspect ratio: **16:9**. If the tool only does 1:1, generate then upscale/crop to 1280×720.

## Option C — Hybrid (best results)

1. Use Option B to generate the **background + portrait composition**.
2. Open in Figma/Canva/Photopea, paste the headline text and brand chips on top so the typography stays crisp.

## Variations to try

Swap the headline in `thumbnail.html` for any of these:

- "I Replaced My Running Coach With **GPT-5**"
- "Strava + AI = My New PB"
- "I Built This With Copilot in **48h**"
- "Your Strava Data Has Been Lying To You"

Higher CTR formula: **face + 3-word promise + one number/contrast word** (weekend, 48h, free, replaced, broke).
