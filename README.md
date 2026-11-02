# Recall — flashcards and MCQ practice

A session-only, dependency-free progressive web app for iPad, phone, and desktop. Import one CSV, study, and discard the deck when finished. Ready for GitHub Pages: no coding, build step, API key, account system, or backend is required.

## Put the app on GitHub Pages

1. Download and unzip the app package. On iPad, save it to Files, then tap the ZIP to extract it.
2. Sign in at [github.com](https://github.com) and create a new repository named `recall-pwa`. Use **Public** for GitHub Pages on the free plan. Initialize it with a README if GitHub offers that option.
3. In the repository, choose **Add file → Upload files**. In a completely empty repository, the link may say **uploading an existing file**.
4. Upload the extracted files themselves, **not the ZIP and not an enclosing folder**. `index.html` must be at the repository’s top level. You can upload all files from the ZIP. If uploading on iPad, the required files are:

   - `index.html`
   - `styles.css`
   - `app.js`
   - `core.js`
   - `sw.js`
   - `manifest.webmanifest`
   - `icon-192.png`
   - `icon-512.png`
   - `icon-maskable-512.png`
   - `apple-touch-icon.png`

   `.nojekyll` is included to disable GitHub’s optional Jekyll processing; upload it too if your file picker shows it. The app’s ordinary files also work without it. README, sample CSV, package.json, and tests are useful to retain but not required to run the app.

5. Choose **Commit changes**, saving to `main`.
6. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, select **main**, choose **/(root)**, and click **Save**.
7. Wait for the Pages deployment to finish. The exact live link appears in **Settings → Pages**; it will normally be `https://YOUR-USERNAME.github.io/recall-pwa/`.
8. Open that live HTTPS link in Safari on your iPad. Do not open the downloaded `index.html` directly from Files; installation and offline support need a web address.
9. Tap **Share → Add to Home Screen** (possibly under **More / View More**). If shown, enable **Open as Web App**, then tap **Add**.
10. Launch Recall from its new Home Screen icon while online. Keep the app open online briefly to let it cache, then import your CSV using **Import CSV**. Import into the installed app itself: Safari and Home Screen app storage can differ.

The hosted app is public, but importing a CSV does not upload your cards to GitHub or any server. Upload only the app files to the repository; import personal decks inside the running app.

Official instructions checked November 2, 2026:

- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Create a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Add a website as an app on iPad](https://support.apple.com/en-mide/guide/ipad/ipad8f1f7a29/ipados)

## Your CSV format

Save as UTF-8 CSV with exactly two columns:

```csv
FRONT,BACK
What is the capital of France?,Paris
What is the capital of Japan?,Tokyo
What is the capital of Italy?,Rome
What is the capital of Canada?,Ottawa
```

Quoted commas, escaped quotes, line breaks inside quoted cells, Windows line endings, and a UTF-8 BOM are supported. Leading/trailing field whitespace is trimmed. Header case and order may vary, but both FRONT and BACK must be present and there must be exactly two columns. Wholly empty rows are ignored; partially empty or malformed rows reject the import with an explanation. Limits: 5 MB per file and 10,000 cards per deck. Decks are held only in memory.

Use **Swap sides** after import to reverse the question and answer direction. This preference lasts for the current session. Importing another valid CSV replaces the current deck. A rejected import returns you to the import screen with no active deck.

## Study controls

| Mode | Keyboard | Touch / mouse |
| --- | --- | --- |
| Flashcards | Left / right: previous / next | Previous / Next buttons |
| Flashcards | Up **or** down: flip | Tap the card or Flip card |
| MCQ | 1–4: choose answers A–D respectively | Tap one of four answers |
| MCQ after an incorrect answer | **Any key**: continue after seeing the correct answer | Tap any answer |
| MCQ after a correct answer | Automatically advances after briefly showing green | Automatically advances |

Use **Dark** or **Light** in the top bar to switch appearance. The app starts in dark mode when opened; the selection lasts until it is reloaded. Use **A−** and **A+** to decrease or increase the text size in both modes. It starts at 200% of the original size, changes in 20-percentage-point steps, and ranges from 120% to 360%. The X/Y counter shows unique cards reviewed or cleared / total cards in the imported set; a card counts as reviewed when displayed. Flashcards are review-only: there is no right/wrong tracking. Navigation stops at the first and last card. Flashcards remain in their imported order.

MCQ practice presents new cards in import order by default. Turn on **Shuffle** to randomize their order; changing it during an unfinished run asks to restart the run. In either mode, an incorrectly answered card is inserted after the next four cards, or at the end if fewer than four remain, and repeats until answered correctly. The original relative order of the remaining questions is preserved. The internal attempt history includes repeats. Each question has the correct answer and three randomly selected, distinct answers from the other cards, shuffled into four positions. Duplicate comparison ignores capitalization, surrounding/repeated whitespace, and equivalent Unicode forms. Import requires at least four unique FRONT values and four unique BACK values, counted independently with the same normalization. Otherwise, neither study mode starts: the app says **“Insufficient flashcards. Try a different deck.”**

Your first answer is final for that question. Green with a check mark means correct and advances automatically after about 0.8 seconds; red with an X means incorrect, and the correct answer is also highlighted. After an incorrect answer, any fresh keyboard press continues. A 1–4 key used to continue does not also answer the next question. Held-key repeats are ignored. System-reserved keys that the browser never receives cannot be handled by the app. When every card is cleared, the results show each card missed at least once. You can practice only those cards or the full deck again. A missed-card retry draws answer choices from the full deck and follows the selected question order. There is no saved history.

## Session-only behavior

- The app starts at an import screen. There is no saved-deck library, deck capacity, or automatic sample deck.
- One imported CSV lives in memory. You can switch between review and MCQ, change direction, and practice again without re-importing during that open session.
- **End session** clears the deck, scores, and card text. Reloading or closing the page also loses the deck; import the CSV again next time. Backgrounding the app may preserve the open session, but the operating system can discard it.
- An invalid import leaves no active deck and asks you to choose another CSV.
- The PWA caches only its application files for offline use. It never saves imported cards to browser storage, IndexedDB, service-worker caches, or a server.
- Keep your CSV accessible locally in Files if you want to import it while offline. A cloud-only file may need downloading beforehand.

## Check it on your iPad

1. Import `sample.csv`; confirm that it shows four cards.
2. In flashcards, try left/right and both up/down arrows. Check that no score is shown.
3. Turn on Swap sides and confirm that answers appear first. Switch back.
4. In MCQ, answer incorrectly with 1–4. Confirm that the correct answer is shown, then press a letter, an arrow, or 1–4 to continue. The next question must remain unanswered until your next answer pick.
5. Complete the run, then try **Practice missed cards**.
6. End the session and confirm the import screen returns. Import again and reload: the import screen should return with no remembered deck or score.
7. Try a CSV with fewer than four unique FRONT values, then one with fewer than four unique BACK values. Both should be refused with **Insufficient flashcards. Try a different deck.**
8. After opening the app online and allowing it time to cache, turn off Wi-Fi/cellular access. Reopen the app, import a locally downloaded CSV from Files, and confirm reviewing and MCQ work. Reconnect afterward.

## Troubleshooting

- **404 / README appears instead of the app:** ensure `index.html` is at the top level of `main`, Pages is set to `main` and `/(root)`, and the Pages deployment has finished. Use the live link shown in Pages settings.
- **Offline not ready:** use the live HTTPS page with an internet connection; ensure all ten required files were uploaded, then reload. Browser restrictions can block service-worker caching.
- **Import error:** export as UTF-8 comma-separated CSV, not XLSX or semicolon-separated text. Check both headers and quote fields that contain commas.
- **Import screen returns after reopening:** this is intentional. Import a CSV to start a fresh session.

## For development

Everything runs directly in the browser. `index.html`, `styles.css`, `app.js`, and `core.js` are the app; `manifest.webmanifest`, `sw.js`, and the PNG icons provide the PWA support. All runtime URLs are relative so both a domain root and GitHub Pages repository paths work.

Optional local preview on a computer with Python:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Service workers work on localhost or HTTPS, not on a `file://` URL.

Optional tests with Node.js 20 or newer; no dependency install is needed:

```sh
node --test app.test.mjs
```

Delivery validation: **33 automated tests passed**, including independent FRONT/BACK import validation, temporary deck lifecycle, rejecting invalid replacements, clearing card content on End session, any-key and tap continuation after wrong answers without accidentally answering the next question, existing CSV/scoring tests, and simulated offline caching. The app event handlers are tested with a lightweight DOM fixture. Browser preview infrastructure is unavailable, so the accompanying interactive mockup is not a real-device screenshot. Physical iPad keyboard, installation, and offline behavior still need the checks above.
