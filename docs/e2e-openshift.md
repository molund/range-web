# E2E on OpenShift

The Playwright suite in `tests/e2e/` runs as a one-shot Kubernetes Job in the **tools** namespace (`c1643c-tools`). It reaches the site being tested only through its publicly accessible URLs, so one Job setup can test every environment. Nothing is deployed alongside the app.

## Architecture

```
GitHub Actions (playwright-openshift.yaml)          OpenShift: c1643c-tools
├─ Set target site (environment → BASE_URL/CMS_URL)
├─ oc start-build --from-dir=tests/e2e ──────────▶  BuildConfig playwright-runner → image @sha256
├─ oc process | oc create ───────────────────────▶  Job bcparks-e2e-<run id>-<attempt>
├─ stream logs, wait for the exit code              ├─ e2e: npm run test:<browser> ──▶ public URL
├─ oc cp report → upload-artifact                   └─ artifact-sync: sleep infinity, holds results
└─ delete the Job
```

Every run builds the image from the commit under test and pins the Job to that build's digest. Two runs at once (for example two PRs) get separate builds, Jobs and reports.

## One-time setup

### 1. Create the BuildConfig and ImageStream

```bash
oc process -f openshift/builds/e2e.yaml | oc apply -f - -n c1643c-tools
```

The BuildConfig has no triggers, so applying it doesn't start a build. The workflow starts one on every run. To build by hand from your checkout:

```bash
oc start-build playwright-runner --from-dir=tests/e2e --follow -n c1643c-tools
```

`tests/e2e/.dockerignore` keeps local `env/.env.*` files (which can hold credentials) and `node_modules` out of the image.

A plain `oc start-build playwright-runner`, without `--from-dir`, clones `bcgov/bcparks.ca` at `main` and builds `tests/e2e` from there.

### 2. Grant the Actions ServiceAccount (RBAC)

```bash
oc apply -f openshift/rbac/e2e.yaml
```

This binds the `githubactions` ServiceAccount in `c1643c-tools`, which backs `OPENSHIFT_TOKEN`, to a Role in the same namespace. The Role covers starting binary builds, reading builds and ImageStreams, managing Jobs, reading pods and logs, and `pods/exec` (which `oc cp` needs). Nothing is granted in dev, test or prod.

### 3. Find the tools namespace's fsGroup

The Job's results volume needs an `fsGroup` inside the namespace's allowed range, or OpenShift rejects the pod:

```bash
oc describe ns c1643c-tools | grep supplemental-groups
# openshift.io/sa.scc.supplemental-groups=1001230000/10000  → use 1001230000
```

### 4. GitHub secrets and variables

| Name                           | Kind     | Value                                        |
| ------------------------------ | -------- | -------------------------------------------- |
| `OPENSHIFT_SERVER`             | secret   | Gold API server URL                          |
| `OPENSHIFT_TOKEN`              | secret   | `githubactions` ServiceAccount token (below) |
| `OPENSHIFT_GOLD_LICENSE_PLATE` | secret   | `c1643c` (bcparks.ca already has this one)   |
| `E2E_FS_GROUP`                 | variable | The number from step 3                       |

```bash
secret=$(oc get sa githubactions -n c1643c-tools -o jsonpath='{.secrets[*].name}' | tr ' ' '\n' | grep -v dockercfg | head -1)
oc get secret "$secret" -n c1643c-tools -o jsonpath='{.data.token}' | base64 -d
```

## Manual run (oc)

```bash
build=$(oc start-build playwright-runner --from-dir=tests/e2e -o name -n c1643c-tools)
oc logs -f "$build" -n c1643c-tools
digest=$(oc get "$build" -n c1643c-tools -o jsonpath='{.status.output.to.imageDigest}')

oc process -f openshift/deployments/e2e.yaml \
  -p JOB_NAME=bcparks-e2e-manual \
  -p E2E_IMAGE="image-registry.openshift-image-registry.svc:5000/c1643c-tools/playwright-runner@$digest" \
  -p ENV=dev \
  -p BASE_URL=https://main-public-c1643c-dev.apps.gold.devops.gov.bc.ca/ \
  -p CMS_URL=https://dev-cms.bcparks.ca/ \
  -p SUITE=full-chromium \
  -p FS_GROUP=<number from step 3> \
  | oc create -f - -n c1643c-tools
```

Watch the suite, then read the result:

```bash
pod=$(oc get pods -l job-name=bcparks-e2e-manual -n c1643c-tools -o jsonpath='{.items[0].metadata.name}')
oc logs -f "$pod" -c e2e -n c1643c-tools
oc get pod "$pod" -n c1643c-tools -o jsonpath='{.status.containerStatuses[?(@.name=="e2e")].state.terminated.exitCode}'
oc cp "$pod:/e2e/results/report/." ./playwright-report -c artifact-sync -n c1643c-tools
oc cp "$pod:/e2e/results/artifacts/." ./test-results -c artifact-sync -n c1643c-tools
oc delete job bcparks-e2e-manual -n c1643c-tools
```

The `e2e` container's exit code is the suite result (0 = green). The `artifact-sync` sidecar keeps the shared volume alive so the report can be copied out, then you delete the Job.

## GitHub Actions

`.github/workflows/playwright-openshift.yaml` has the same interface as bcparks.ca's `playwright.yaml`:

- **`pull_request`** to `main` or `alpha`, when `tests/e2e/**`, `openshift/**` or the workflow changes. PRs run `full-chromium` against prod (PRs to `main`) or alpha-test (PRs to `alpha`). PRs from forks are skipped, because they don't get the secrets. A new push to the same PR cancels the previous run.
- **`workflow_dispatch`** with `environment` (prod, test, dev, alpha-test, alpha-dev) and `suite` (full-chromium, full-firefox, full-webkit, content-check). Manual runs never cancel each other.

The suite's exit code decides the workflow result. The HTML report and test results are uploaded as the `playwright-report` artifact.

## How the Job runs the tests

The Job sets `CI=true`, `ENV`, `BASE_URL`, `CMS_URL` and `SUITE`, then runs `npm run test:<browser>` (or `npm run test:content-check`), the same scripts as on a GitHub runner. bcparks.ca's `playwright.config.js` doesn't need changes:

- `PLAYWRIGHT_HTML_OUTPUT_DIR=/e2e/results/report` moves the HTML report onto the shared volume.
- `--output=/e2e/results/artifacts` does the same for traces and screenshots.
- `BASE_URL` comes from the environment, so `env/.env.<ENV>` isn't needed in the image.

## Troubleshooting

- **Pod rejected / `fsGroup` not allowed:** `E2E_FS_GROUP` isn't in the tools namespace's range (setup step 3).
- **Build fails pulling the base image:** check that the Playwright tag in `openshift/builds/e2e.yaml` exists and matches `@playwright/test`.
- **Chromium fails to launch:** Playwright launches Chromium without its sandbox by default, which is what OpenShift's restricted pods need. Check that nothing in the config sets `chromiumSandbox: true`, and look at the `e2e` container's logs for the launch error.
- **Can't reach the site:** check that the tools namespace allows egress, and test from a debug pod: `oc run curl --rm -it --image=curlimages/curl -n c1643c-tools -- curl -I <url>`. For prod, the vanity route's `ip_whitelist` may not include the cluster's egress IP.
- **Job left behind:** a cancelled run can't delete its Job. The `artifact-sync` sidecar keeps the pod running, so the Job only ends at its 1-hour `activeDeadlineSeconds`, and `ttlSecondsAfterFinished` deletes it an hour after that. To clean up sooner: `oc delete jobs -l app=bcparks-e2e -n c1643c-tools`.
- **Out of quota:** each run requests 500m CPU / 1Gi for the tests, plus the build. Many PRs at once can exceed the tools quota. Builds queue (`runPolicy: Serial`), but Jobs don't.
