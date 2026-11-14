# Publish ExecuVision Studio

The public repository is [unamanic/execuvision-studio](https://github.com/unamanic/execuvision-studio). GitHub Pages serves [Studio](https://unamanic.github.io/execuvision-studio/) and its [illustrated user guide](https://unamanic.github.io/execuvision-studio/guide/).

## Updating the published site

Run `npm test`, commit the reviewed changes, and push `main`. The workflow publishes the built app and guide together. The current repository already uses GitHub Actions as its Pages source.

## Setting up another repository

Create a repository under your own account, add it as the Git remote, and push the `main` branch. Update `package.json` and documented public URLs to match its owner and name.

In the new repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**. Then open **Actions → Test and deploy GitHub Pages → Run workflow** on `main`. If the first push's deployment ran before Pages was configured, rerun it after selecting the source.

The workflow builds the static artifact, runs the standalone tests, and deploys `site/`. Later pushes to `main` publish automatically. Pull requests run the same checks but do not deploy. No deployment token, external backend, npm install, or original artwork is required.

Wait for the deployment job to finish and check the URL shown by GitHub. Open the demo, make and undo an edit, save/reopen a project, and run the slides. The Pages URL and remote repository are not verified until those steps succeed.

[GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) describes the Settings and workflow steps.

## Preview the project URL layout

All assets and download links are relative, so the application works under a repository path:

```sh
npm run build
BASE_PATH=/execuvision-studio/ npm run preview
```

The automated preview test also exercises this prefix. GitHub Actions uploads only `site/`, including decoder source archives and license notices.

## Release archives

```sh
npm run package
```

This creates `release/execuvision-studio-source.zip`, `release/execuvision-studio-site.zip`, and `release/SHA256SUMS`. The source archive uses Git's tracked-file list and excludes hosting identity, original samples, user projects, and generated output. It contains the files needed to build and test without the private research workspace. The site archive opens with `index.html` and can also be hosted as static files.

These archives are local preparation artifacts until uploaded or published. `release/` is ignored by Git. The 7z wrapper and 7-Zip corresponding source archives under `dist/third_party/sources/` are intentional tracked third-party materials and must remain included.

If publishing under another owner or repository name, update `package.json` and these documented URLs. The app's relative asset paths require no code changes.
