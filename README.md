# Nym — pen name desk

Nym is the desk a publishing assistant works from when an author wants to publish
under a name that is not their own. A request captures the author's legal name and
a short brief; generation runs automatically; every returned name is screened
against the legal name and for prior use before an assistant ever sees it; the
assistant approves, and the request moves to History with the approver recorded.

This repository implements the design handed over from Claude Design
(`project/Nym.dc.html` and `project/Nym Style Guide.dc.html`, both kept for
reference) as an Angular 21 client and a NestJS API.

---

## Contents

| Path                  | What it is                                             |
| --------------------- | ------------------------------------------------------ |
| `apps/web`            | Angular 21 client — standalone, zoneless, signal-based |
| `apps/api`            | NestJS 11 API — TypeORM/Postgres, OIDC, Anthropic      |
| `packages/shared`     | Wire contracts and name tokenisation used by both      |
| `project/`            | The original design prototypes and the style guide     |
| `chats/`              | The design conversation the build was specified from   |
| `scripts/postgres.sh` | Local Postgres without Docker                          |

---

## Quick start

```bash
npm install
npm run build --workspace @nym/shared     # both apps consume the built package

./scripts/postgres.sh start               # creates nym, nym_test and nym_e2e
cp apps/api/.env.example apps/api/.env    # then fill in the values below
npm run migration:run
npm run seed --workspace @nym/api         # optional demo data

npm run start:api                         # http://localhost:3000/api/v1
npm run start:web                         # http://localhost:4200
```

`ng serve` proxies `/api` to the API, so the session cookie is first-party in
development exactly as it is in production behind a single host.

### Environment

Every variable is declared and validated in `apps/api/src/config/configuration.ts`;
a misconfigured deployment fails at boot with a list of what is wrong.
`apps/api/.env.example` documents all of them. Two need real values before the app
can run at all:

- **`ANTHROPIC_API_KEY`** — generation calls the Claude API directly. There is no
  offline fallback, by design.
- **OIDC** — `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
  `OIDC_REDIRECT_URI`. Discovery is standards-based, so the same code works
  against Entra ID, Okta, Auth0 or Keycloak. Claim names differ per provider and
  are mapped with `OIDC_NAME_CLAIM` / `OIDC_EMAIL_CLAIM` / `OIDC_ROLE_CLAIM`
  rather than in code.

> **Outstanding from the client:** the IdP tenant values above. Until they are
> supplied the app cannot complete a sign-in; everything else — schema,
> migrations, screening, the whole UI — is finished and tested.

---

## Architecture

### API

```
main.ts            helmet, cookie-parser, global validation pipe, CORS, Swagger
app.module.ts      config + TypeORM + feature modules
config/            one zod schema for the whole environment, validated at boot
database/          entities, one migration, a development seed
auth/              OIDC code flow (PKCE) → our own session cookie → global guard
generation/        prompt builder, Anthropic client, screening rules, orchestration
requests/          the request lifecycle: CRUD, selection, approval, history
health/            liveness and database readiness
```

Notable decisions:

- **Screening is server-side and re-run on every response.** The model is
  instructed to obey the rules, and is then never trusted to have done so
  (`generation/name-rules.ts`).
- **Generation is asynchronous.** A model call takes tens of seconds, so
  `POST /requests/:id/generate` returns `202` immediately and the row shows
  "Generating…" while the client polls. A second concurrent run on the same
  request is rejected with `409`.
- **Sessions, not IdP tokens, reach the browser.** After the code exchange the API
  mints a short-lived HS256 JWT in an httpOnly, SameSite=Lax cookie. No
  server-side session store is needed and no provider token is exposed.
- **Everything is closed by default.** `SessionAuthGuard` is registered globally;
  an endpoint opts out with `@Public()`, so a new controller cannot ship
  unauthenticated by accident.
- **The approver is denormalised onto the request.** History is an audit surface
  and must keep reading correctly if a user is renamed or deprovisioned.
- **`openid-client` is pinned to v5.** v6 is ESM-only, which fights a CommonJS
  Nest build in Jest and in the TypeORM CLI. v5 is CommonJS and current.

### Web

```
core/     API transport, signal stores (requests, auth, theme, toast), formatting
ui/       the component library: button, fields, pill, checks, modal, toast, …
features/ shell + header, queue, history, refine view, and the three overlays
styles/   design tokens and the global base layer
```

Notable decisions:

- **Zoneless and signal-based**, the Angular 21 default. State lives in a small
  number of stores; components render from signals and raise intents.
- **No inline styles anywhere.** Every value comes from a token in
  `src/styles/tokens.css`, which is section 7 of the style guide plus the
  typography, spacing, sizing and motion scales the components needed.
- **Fonts are self-hosted** (`@fontsource`), so there is no third-party request at
  runtime. Inter carries the interface; Newsreader is reserved for the wordmark,
  page H1s and pen names — the three exceptions the style guide allows.
- **All icons are Lucide** (`@lucide/angular`), rendered at 12–14px and inheriting
  `currentColor` so they follow hover and theme.
- **Tables are real tables with grid layout.** The design's columns mix `minmax()`
  and fixed tracks, which a table layout cannot express, so rows use CSS grid and
  every element carries its ARIA role explicitly. The column-to-cell relationship
  stays exposed to assistive technology — the gap the prototype could not close.

---

## Deploying

Container images build from the repository root, because both apps are workspace
members:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/adamstavely/nym-api:1.0.0 .
docker build -f apps/web/Dockerfile -t ghcr.io/adamstavely/nym-web:1.0.0 .
```

Both run as non-root with a read-only root filesystem. The API image carries no
dev dependencies and no test code; the client is served by unprivileged nginx.

The Helm chart in `deploy/helm/nym` deploys the API, the client, and a migration
hook that runs before either serves traffic:

```bash
helm upgrade --install nym deploy/helm/nym \
  --namespace nym --create-namespace \
  --set publicUrl=https://nym.publisher.example \
  --set config.oidc.issuerUrl=... --set config.oidc.clientId=... \
  --set secrets.existingSecret=nym-credentials

helm test nym --namespace nym
```

`deploy/helm/nym/README.md` covers the values, the credential handling and the
design decisions. Three worth knowing here:

- **One host serves both.** The ingress routes `/api/v1` to the API and
  everything else to the client, so the session cookie stays first-party — the
  same arrangement `ng serve`'s proxy reproduces in development.
- **Readiness checks the database; liveness does not.** A shared database blip
  must not restart every pod at once.
- **Migrations are a release hook** (`node dist/database/migrate.js`, in a single
  transaction). A failed migration fails the release rather than letting new code
  start against an old schema.

---

## Accessibility

The build targets **WCAG 2.2 AA** and is verified, not asserted. Every page and
overlay is scanned with axe-core in both themes as part of the end-to-end suite,
and the criteria a static scan cannot prove have their own tests.

| Criterion                    | How it is met                                                                                       | How it is verified                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1.3.1 Info and relationships | Explicit ARIA roles on the grid-laid tables; captions; `<fieldset>`/`<legend>` for grouped controls | axe + a spec asserting six column headers and six cells per row    |
| 1.4.1 Use of colour          | Status and check outcomes always carry a word and a glyph                                           | Component specs assert the wording changes with the outcome        |
| 1.4.3 Contrast               | Token palette from the style guide                                                                  | axe in light and dark                                              |
| 1.4.10 Reflow                | Grid layouts collapse at 1220px, 1180px and 820px                                                   | Spec asserts no horizontal scroll at a 320px viewport              |
| 1.4.11 Non-text contrast     | `--border-control` on every input and secondary button                                              | axe                                                                |
| 2.1.1 / 2.1.2 Keyboard       | Native buttons, links, radios and selects throughout; CDK focus trap in dialogs                     | Spec tabs 20 times inside a dialog and asserts focus never escapes |
| 2.3.3 Motion                 | `prefers-reduced-motion` disables the spinner, card lift and toast rise                             | Global media query in `styles/base.css`                            |
| 2.4.1 Bypass blocks          | Skip link to `#main-content`                                                                        | Spec asserts it is the first tab stop                              |
| 2.4.7 Focus visible          | Global `:focus-visible` ring; nothing removes outlines                                              | Token-driven, covered by axe                                       |
| 2.5.3 Label in name          | Accessible names contain the visible text                                                           | axe                                                                |
| 2.5.8 Target size            | 24px minimum, 26px in practice                                                                      | Spec measures every visible control                                |
| 3.1.1 Language               | `lang="en-GB"`                                                                                      | Spec                                                               |
| 4.1.2 Name, role, value      | Every icon-only control has an `aria-label`; `aria-pressed` on toggles                              | Spec enumerates them                                               |
| 4.1.3 Status messages        | The toast is a permanent `role="status" aria-live="polite"` region that never takes focus           | Spec asserts focus stays put                                       |

One real defect was found this way and fixed: muted text on the rail measured
4.47:1, just under AA, because the rail is darker than the canvas. It now uses a
dedicated `--muted-on-rail` token at 5.19:1.

Modal dialogs remember what had focus, move focus inside on open, trap Tab, close
on Escape, and restore focus to the trigger on close. Focus is moved explicitly
rather than through the CDK's auto-capture, which waits on an NgZone stable event
that a zoneless application never emits.

---

## Testing

Three tiers, all runnable from the repository root.

```bash
npm run test:unit          # Vitest (web) + Jest (API)
npm run test:integration   # Jest + Supertest against a real Postgres
npm run test:e2e           # Playwright + axe-core against the real stack
```

| Tier            | Count | What it covers                                                                                                                                                                                                         |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API unit        | 84    | Every clause of the screening rules, prompt composition, the generation state machine, response parsing, config validation, the entity→DTO mapping                                                                     |
| API integration | 42    | The whole lifecycle over a real schema: intake, screening, regeneration with locks, approval and bulk approval, history, reopening, search, prompt overrides, deletion, plus the session guard and the OIDC round-trip |
| Web unit        | 80    | Stores, the HTTP interceptor, formatting, and the components' behaviour and semantics                                                                                                                                  |
| End-to-end      | 39    | Every journey in the design, plus the accessibility suite above                                                                                                                                                        |

Only two things are ever substituted: the language model and the identity
provider. Neither can be reached deterministically from a test run, and both sit
behind an interface for exactly that reason. The database is always real.

`apps/api/test/e2e-server.ts` is the API process end-to-end runs drive. It lives
under `test/` and is never part of the built application; it swaps in a scripted
generator and adds a controller that can reset the database and mint a session.

### Running end-to-end tests

```bash
./scripts/postgres.sh start
npm run test:e2e --workspace @nym/web
```

Playwright starts both servers itself. If the machine already has a Chromium that
does not match the Playwright build, point at it rather than downloading another:

```bash
NYM_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e --workspace @nym/web
```

---

## Product rules

These are implemented server-side, as section 5 of the style guide requires.

**Intake.** First name, middle initial and last name compose into the legal name.
Generation starts on create; the assistant never presses Generate for a new
request.

**Overlap screen.** A candidate is rejected if any part of it shares a whole word,
a first letter, or a three-letter phonetic stem with any part of the legal name, or
if one name part contains another. Single-letter middle initials are compared
against every initial of the legal name — including the legal name's own middle
initial. Comparison is case-insensitive and strips punctuation.

**Prior use.** Any candidate the model flags is discarded silently. Production
should verify against a real catalogue and rights database rather than model
recall; the seam for that is `NameGenerator`.

**Shape.** Every candidate must be given name + middle initial + surname. Names
without a middle initial are discarded. Surnames are upper-cased at data level.

**Presentation.** Only cleared names are shown, with a count of what screening
removed so the assistant knows it ran.

**Regeneration.** Locked names are kept and passed back to the model as "do not
repeat, match this register"; everything else is replaced. A free-text refinement
applies to that pass only. Retry appears only on a failed request.

**Approval.** From the queue it accepts the proposed name; from the refine view it
accepts the selected one; bulk approval takes the proposed name of every ready
request. Every approval records the approver and the time, raises a toast, and
moves the request to History. Reopening clears the approval.

---

## Conventions

- **Commits and reviews.** `npm run lint`, `npm run typecheck` and `npm test` must
  pass; CI runs all three plus the end-to-end suite.
- **Schema changes go through migrations.** `DATABASE_SYNCHRONIZE` stays false
  outside local experimentation.
- **New endpoints are authenticated by default.** Marking one `@Public()` should
  be a deliberate, reviewed decision.
- **New styling values go in `tokens.css` first.** A literal colour or size in a
  component stylesheet is a review comment.
