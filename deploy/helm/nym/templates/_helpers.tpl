{{/*
Chart name, overridable.
*/}}
{{- define "nym.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified release name, capped at 63 characters for label validity.
*/}}
{{- define "nym.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "nym.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Labels every object carries.
*/}}
{{- define "nym.labels" -}}
helm.sh/chart: {{ include "nym.chart" . }}
{{ include "nym.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: nym
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "nym.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nym.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Per-component labels. Call as (dict "context" $ "component" "api").
*/}}
{{- define "nym.componentLabels" -}}
{{ include "nym.labels" .context }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "nym.componentSelectorLabels" -}}
{{ include "nym.selectorLabels" .context }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "nym.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "nym.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Image reference. A digest wins over a tag, because a digest is what makes a
rollout reproducible. Call as (dict "context" $ "image" .Values.api.image).
*/}}
{{- define "nym.image" -}}
{{- $registry := .context.Values.global.imageRegistry -}}
{{- $repository := .image.repository -}}
{{- $full := $repository -}}
{{- if $registry -}}
{{- $full = printf "%s/%s" $registry $repository -}}
{{- end -}}
{{- if .image.digest -}}
{{- printf "%s@%s" $full .image.digest -}}
{{- else -}}
{{- printf "%s:%s" $full (default .context.Chart.AppVersion .image.tag) -}}
{{- end -}}
{{- end -}}

{{/*
The Secret the API reads its credentials from.
*/}}
{{- define "nym.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "nym.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "nym.configMapName" -}}
{{- printf "%s-config" (include "nym.fullname" .) -}}
{{- end -}}

{{- define "nym.apiFullname" -}}
{{- printf "%s-api" (include "nym.fullname" .) -}}
{{- end -}}

{{- define "nym.webFullname" -}}
{{- printf "%s-web" (include "nym.fullname" .) -}}
{{- end -}}

{{/*
The external host, taken from publicUrl unless ingress.host overrides it.
*/}}
{{- define "nym.ingressHost" -}}
{{- if .Values.ingress.host -}}
{{- .Values.ingress.host -}}
{{- else -}}
{{- $withoutScheme := regexReplaceAll "^https?://" .Values.publicUrl "" -}}
{{- regexReplaceAll "/.*$" $withoutScheme "" -}}
{{- end -}}
{{- end -}}

{{/*
The OIDC callback. Derived from publicUrl so it cannot drift from the address a
browser is actually redirected back to; override for an unusual edge setup.
*/}}
{{- define "nym.oidcRedirectUri" -}}
{{- if .Values.config.oidc.redirectUri -}}
{{- .Values.config.oidc.redirectUri -}}
{{- else -}}
{{- printf "%s/%s/auth/callback" (trimSuffix "/" .Values.publicUrl) (trim .Values.config.apiPrefix) -}}
{{- end -}}
{{- end -}}

{{- define "nym.oidcPostLogoutRedirectUri" -}}
{{- default .Values.publicUrl .Values.config.oidc.postLogoutRedirectUri -}}
{{- end -}}

{{/*
The API's full environment: non-secret values from the ConfigMap, credentials
from the Secret. Kept in one place so the Deployment and the migration Job can
never disagree about how the database is reached.
*/}}
{{- define "nym.apiEnv" -}}
- name: NODE_ENV
  value: production
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "nym.secretName" . }}
      key: {{ .Values.secrets.keys.databaseUrl }}
- name: ANTHROPIC_API_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "nym.secretName" . }}
      key: {{ .Values.secrets.keys.anthropicApiKey }}
- name: OIDC_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ include "nym.secretName" . }}
      key: {{ .Values.secrets.keys.oidcClientSecret }}
- name: SESSION_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ include "nym.secretName" . }}
      key: {{ .Values.secrets.keys.sessionSecret }}
{{- end -}}

{{/*
Validates the configuration a release cannot start without, so a bad values file
fails at `helm install` rather than in a crash-looping pod.
*/}}
{{- define "nym.validateValues" -}}
{{- if not .Values.publicUrl -}}
{{- fail "publicUrl is required: it drives CORS, the sign-in redirect and the OIDC callback." -}}
{{- end -}}
{{- if not .Values.config.oidc.issuerUrl -}}
{{- fail "config.oidc.issuerUrl is required. See the chart README for per-provider examples." -}}
{{- end -}}
{{- if not .Values.config.oidc.clientId -}}
{{- fail "config.oidc.clientId is required." -}}
{{- end -}}
{{- if and (not .Values.secrets.existingSecret) (not .Values.secrets.create) -}}
{{- fail "Set secrets.existingSecret, or secrets.create with the four credential values." -}}
{{- end -}}
{{- if and .Values.secrets.create (not .Values.secrets.existingSecret) -}}
{{- if not .Values.secrets.databaseUrl -}}
{{- fail "secrets.databaseUrl is required when the chart creates the Secret." -}}
{{- end -}}
{{- if not .Values.secrets.anthropicApiKey -}}
{{- fail "secrets.anthropicApiKey is required when the chart creates the Secret." -}}
{{- end -}}
{{- if not .Values.secrets.oidcClientSecret -}}
{{- fail "secrets.oidcClientSecret is required when the chart creates the Secret." -}}
{{- end -}}
{{- if not .Values.secrets.sessionSecret -}}
{{- fail "secrets.sessionSecret is required when the chart creates the Secret." -}}
{{- end -}}
{{- if lt (len .Values.secrets.sessionSecret) 32 -}}
{{- fail "secrets.sessionSecret must be at least 32 characters; the API rejects anything shorter at boot." -}}
{{- end -}}
{{- end -}}
{{- end -}}
