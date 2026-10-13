# Playwright on OpenShift: reference fork of bcgov/range-web

## Why this fork exists

I was searching the [bcgov](https://github.com/bcgov) organization for teams that run
Playwright end-to-end tests successfully on OpenShift. [bcgov/range-web](https://github.com/bcgov/range-web)
(MyRangeBC) has a clean, working pattern, and I plan to reuse it for
[bcgov/bcparks.ca](https://github.com/bcgov/bcparks.ca).

On GitHub Actions runners, bcparks.ca's Playwright tests get rate-limited by the BC Gov
network edge partway through each run. Workarounds didn't solve it, and neither did moving
to the bcgov static-IP larger runners. Running the tests as a Job inside OpenShift is one
of the alternatives I'm looking at.

This fork is a **reference copy**. It isn't a contribution back to range-web, and nothing here
is meant to be merged upstream. I removed the MyRangeBC application (React app, API/web
deployments, BCGov pipeline). Only the files the e2e pattern depends on are left.

Thank you to the range-web team for doing the hard work in the open.

## The pattern in one picture

```
GitHub Actions (playwright-openshift.yaml)          OpenShift: c1643c-tools
├─ oc start-build --from-dir=tests/e2e ──────────▶  BuildConfig playwright-runner → image @sha256
├─ oc process openshift/deployments/e2e.yaml ────▶  Job bcparks-e2e-<run id>
│     | oc create                                    ├─ e2e: npm run test:<browser>
├─ stream logs, wait for the exit code                │     ──▶ https://bcparks.ca/ (or a Gold route)
├─ oc cp report → upload-artifact                    └─ artifact-sync: keeps the results volume
└─ delete the Job                                        alive for oc cp
```

The GitHub runner never talks to bcparks.ca. It builds the test image from the commit under test,
starts a Job in the tools namespace, and collects the report. The test traffic comes from inside
the cluster.

The workflow has the same interface as bcparks.ca's current `playwright.yaml`: the same
`environment` and `suite` inputs, the same URL logic and the same PR trigger. It's meant to run
alongside it until the in-cluster runs prove they get past the block.

**Changes from upstream:** range-web ran the Job in its dev namespace after each deploy, with SSO
login and direct Postgres access for seeding test data. Here the Job runs in tools against public
URLs only. Each run gets its own Job name and an image pinned by digest, so PRs don't collide.
The suite is a placeholder shaped like bcparks.ca's `tests/e2e`. range-web's original suite is in
[upstream's history](https://github.com/bcgov/range-web/tree/dev/playwright/e2e).

## What's here

| Path                                          | Role                                                               |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `.github/workflows/playwright-openshift.yaml` | Build image → run Job → collect report → delete Job                |
| `openshift/builds/e2e.yaml`                   | ImageStream + BuildConfig for the test image (no triggers)         |
| `openshift/deployments/e2e.yaml`              | Job template: suite, URLs, fsGroup, results volume, sidecar        |
| `openshift/rbac/e2e.yaml`                     | Least-privilege Role for the GitHub Actions service account        |
| `tests/e2e/Dockerfile.e2e`, `.dockerignore`   | Test image on the Playwright base image (all browsers included)    |
| `tests/e2e/` (rest)                           | Placeholder suite with bcparks.ca's scripts, projects and env vars |
| `docs/e2e-openshift.md`                       | Setup runbook: build config, RBAC, fsGroup, secrets and variables  |

Start with [`docs/e2e-openshift.md`](docs/e2e-openshift.md).

## Copying it into bcparks.ca

1. Copy `tests/e2e/Dockerfile.e2e` and `tests/e2e/.dockerignore` into bcparks.ca's `tests/e2e/`.
   Keep the rest of bcparks.ca's `tests/e2e` as it is: the placeholder suite here has the same
   interface.
2. Copy `openshift/` to wherever it fits, for example `infrastructure/e2e/`. Update the
   `oc process -f` path and the `pull_request` paths filter in the workflow to match.
3. Copy `.github/workflows/playwright-openshift.yaml`.
4. Do the one-time setup in `docs/e2e-openshift.md`.

Keep the Playwright version in sync in three places: `@playwright/test` in `package.json`, the
`FROM` line in `Dockerfile.e2e`, and the base image in `openshift/builds/e2e.yaml`.

**Risk to check first:** prod uses the `bcparks.ca` vanity route, which has an `ip_whitelist`.
Requests from a pod may come from a cluster egress IP that isn't on the list. The non-prod Gold
routes have no whitelist, so run `environment=dev` first, then `prod`.

## Running locally

```bash
cd tests/e2e
npm ci
npx playwright install chromium
BASE_URL=https://main-public-c1643c-dev.apps.gold.devops.gov.bc.ca/ npm run test:chromium
```

## License

    Copyright 2018 Province of British Columbia

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
