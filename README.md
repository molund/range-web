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
GitHub Actions (.github/workflows/e2e.yml)        OpenShift
├─ push to dev  ──▶ oc start-build range-web-e2e  ──▶ tools ns: BuildConfig → ImageStream
│                   (Dockerfile.e2e, Playwright base image)
├─ wait for the app under test to finish rolling out in dev
└─ oc process openshift/deployments/e2e.yaml | oc create  ──▶ dev ns: Job
      poll exit code → oc logs → retry once on SSO failure       ├─ e2e container: npx playwright test
      → oc cp report/traces → upload-artifact → delete Job       └─ artifact-sync sidecar: keeps the
                                                                     results volume alive for oc cp
```

The tests run inside the cluster, so they can reach the dev database directly over the
service network. The database is used to seed and clean up test data. GitHub Actions only
orchestrates: it starts the Job, waits for it, and collects the results.

## What's here

| Path                             | Role                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `.github/workflows/e2e.yml`      | Orchestrates build → wait → run Job → collect artifacts                                |
| `openshift/builds/e2e.yaml`      | ImageStream + BuildConfig for the test image                                           |
| `openshift/deployments/e2e.yaml` | Job template: params, secrets, results volume, sidecar                                 |
| `openshift/rbac/e2e.yaml`        | Least-privilege Roles for the GitHub Actions service account                           |
| `Dockerfile.e2e`                 | Test image. Copies only the package files, `playwright.config.js` and `playwright/`    |
| `playwright.config.js`           | Reads all `PLAYWRIGHT_*` settings from environment variables                           |
| `playwright/e2e/`                | range-web's specs and support helpers, kept as worked examples (SSO login, DB seeding) |
| `docs/e2e-openshift.md`          | range-web's setup runbook: build config, secrets, RBAC, GitHub secrets                 |

Start with [`docs/e2e-openshift.md`](docs/e2e-openshift.md). It explains how to set up and
run the pattern.

## Things to change when copying it

- Namespaces (`3187b2-*`), URLs, secret names and the database host are specific to MyRangeBC.
- The `wait-for-dev-deploy` job polls range-web's own build and deployment
  (`range-web`, `range-web-caddy`). Point it at your app.
- The `@playwright/test` version must match the base image tag in `Dockerfile.e2e`.
- The Job's `securityContext.fsGroup` is hardcoded. Use the template's `${FS_GROUP}` parameter
  and set it to a value in your namespace's supplemental group range.

## Running locally

```bash
npm ci
npm run test:e2e:verify   # install Chromium
npx playwright test --list
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
