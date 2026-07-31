# Nym Helm chart

Deploys the Nym pen name desk: the NestJS API, the Angular client behind nginx,
and a migration hook that runs before either serves traffic.

The chart does **not** deploy a database. Nym expects a managed Postgres reached
through a connection string, so Helm never owns the lifecycle of the data.

---

## What it creates

| Object                        | Notes                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| `Deployment` × 2              | API and web, both non-root with a read-only root filesystem |
| `Service` × 2                 | ClusterIP                                                   |
| `Ingress`                     | One host: `/{apiPrefix}` → API, `/` → web                   |
| `ConfigMap` × 2               | Application config, and the nginx server block              |
| `Secret`                      | Only when `secrets.create` and no `existingSecret`          |
| `Job`                         | Migrations, as a `pre-install,pre-upgrade` hook             |
| `ServiceAccount`              | Token not mounted — nothing talks to the Kubernetes API     |
| `HorizontalPodAutoscaler` × 2 | When `autoscaling.enabled`                                  |
| `PodDisruptionBudget` × 2     | On by default                                               |
| `NetworkPolicy` × 2           | When `networkPolicy.enabled`                                |

## Install

```bash
helm upgrade --install nym deploy/helm/nym \
  --namespace nym --create-namespace \
  --set publicUrl=https://nym.publisher.example \
  --set config.oidc.issuerUrl=https://login.microsoftonline.com/<tenant>/v2.0 \
  --set config.oidc.clientId=<client-id> \
  --set secrets.existingSecret=nym-credentials
```

Then:

```bash
helm test nym --namespace nym
```

The test pod proves the client serves its shell, the API answers liveness, and
the database is reachable from inside the cluster.

## Configuration you must supply

The API validates its whole environment at boot and refuses to start
half-configured, so the chart fails at `helm install` rather than in a
crash-looping pod. Four things are required:

| Value                   | Why                                                            |
| ----------------------- | -------------------------------------------------------------- |
| `publicUrl`             | Drives CORS, the post-sign-in redirect and the OIDC callback   |
| `config.oidc.issuerUrl` | Discovery endpoint for your identity provider                  |
| `config.oidc.clientId`  | The application registration                                   |
| The four credentials    | Either `secrets.existingSecret`, or the values under `secrets` |

### Credentials

Production should manage the Secret outside Helm — External Secrets, Sealed
Secrets, or your cloud's secret store — and point the chart at it:

```yaml
secrets:
  create: false
  existingSecret: nym-credentials
```

That Secret needs four keys (rename them with `secrets.keys` if your platform
imposes a convention):

| Key                  | Value                                    |
| -------------------- | ---------------------------------------- |
| `DATABASE_URL`       | `postgres://user:password@host:5432/nym` |
| `ANTHROPIC_API_KEY`  | Generation calls the Claude API directly |
| `OIDC_CLIENT_SECRET` | From your application registration       |
| `SESSION_SECRET`     | ≥32 characters; signs the session cookie |

Letting the chart create the Secret is fine for a preview environment, but the
values then live in the release history.

> Rotating `SESSION_SECRET` invalidates every signed-in session. The Secret the
> chart creates carries `helm.sh/resource-policy: keep` so an uninstall does not
> silently sign everyone out.

### The OIDC callback

Derived from `publicUrl` so it cannot drift from where a browser is actually
sent back to:

```
{publicUrl}/{config.apiPrefix}/auth/callback
```

Register exactly that with your identity provider. `helm install` prints it.

Claim names differ per provider and are mapped in values, not code — Entra ID
puts the email in `preferred_username`, for example. See
`values-production.yaml`.

## Design notes

**One host for both.** The ingress routes `/{apiPrefix}` to the API and
everything else to the client. Same origin means the session cookie is
first-party, which is what the application assumes; a split-host setup would
need third-party cookie handling that the application does not implement.

**Two different health probes.** Readiness checks the database, so a pod that
cannot reach it leaves the Service. Liveness deliberately does not: a shared
database blip would otherwise fail liveness on every pod at once and restart the
whole deployment into a crash loop while the database is already struggling.

**Migrations block the release.** The hook runs before any new pod serves
traffic, in a single transaction. A failed migration fails the release rather
than letting new code start against an old schema.

**Generation is slow on purpose.** A run is a background call to the Claude API
taking tens of seconds. `api.terminationGracePeriodSeconds` defaults to 90 so an
in-flight run can finish during a rollout, and if you use the nginx ingress
controller, raise `proxy-read-timeout` as `values-production.yaml` does.

**No CPU limit by default.** Throttling an event loop mid-request costs more
latency than the noisy-neighbour risk it removes. Add one if cluster policy
requires it.

## Adding an in-cluster database

For a non-production environment, add the Bitnami chart as a dependency:

```yaml
# Chart.yaml
dependencies:
  - name: postgresql
    version: 16.x.x
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
```

```bash
helm dependency update deploy/helm/nym
helm upgrade --install nym deploy/helm/nym \
  --set postgresql.enabled=true \
  --set secrets.databaseUrl='postgres://nym:nym@nym-postgresql:5432/nym'
```

It is left out of the default chart on purpose: a database whose lifecycle is
tied to a Helm release is a hazard in production.

## Images

Both are built from the repository root, because the apps are workspace members:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/adamstavely/nym-api:1.0.0 .
docker build -f apps/web/Dockerfile -t ghcr.io/adamstavely/nym-web:1.0.0 .
```

Pin by digest in production (`api.image.digest`): a tag can move, a digest
cannot, so a rollback returns to exactly the bits that were running.

## Validating changes

```bash
helm lint deploy/helm/nym
helm template nym deploy/helm/nym --values deploy/helm/nym/values-production.yaml \
  --set config.oidc.clientId=x --set secrets.existingSecret=x | kubectl apply --dry-run=client -f -
```
