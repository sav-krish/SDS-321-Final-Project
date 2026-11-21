# Techinance Mastery Tracker

An interactive demo for the SDS 321 final project, "How Many Questions Until We Know?". It uses Bayes' rule to update how sure we are that a student knows a topic after every answer.

This folder is fully self-contained. It does not need the main Techinance site, a build step, or any packages. It uses the same navy, steel and ice colors, fonts and layout as techinance.org.

## Put it on its own GitHub Pages site

1. Create a new GitHub repository (for example `mastery-tracker`).
2. Upload everything in this folder to the root of the repository, including the hidden `.nojekyll` file.
3. Open Settings > Pages. Under "Build and deployment" choose "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. After about a minute the site is live at `https://YOUR-USERNAME.github.io/mastery-tracker/`.

## Run it on your computer

Browsers block ES modules from `file://`, so serve the folder instead of double-clicking the file:

    python3 -m http.server 8000

Then open http://localhost:8000.

## Check the math

    node --test

## Files

- `index.html`: the page
- `site.css`: shared Techinance styles (header, footer, buttons, background)
- `tracker.css`: styles for the tracker
- `bayes-tracker.js`: the Bayes update, exact expected quiz length and the class simulation
- `tracker.js`: the clicker, chart and controls
- `nav.js`, `ambient.js`: mobile menu and the soft background shapes
- `logo.png`: Techinance logo
