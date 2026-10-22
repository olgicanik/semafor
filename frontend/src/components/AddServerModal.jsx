import { useState } from 'react'

/**
 * Add-New-Server modal. The auth_type dropdown dynamically swaps the
 * credential fields (API Key -> token; Basic -> username/password; SSH ->
 * private key; Proxy -> proxy URL). Persists via POST /api/servers.
 */

const EMPTY_SERVER = {
  name: '',
  environment: 'dev',
  auth_type: 'api_key',
  auth_credentials: { token: '' },
}

const AUTH_META = {
  api_key: { label: 'API Key', fields: ['token'], placeholders: { token: 'api-token-123' } },
  basic_auth: {
    label: 'Basic Auth',
    fields: ['username', 'password'],
    placeholders: { username: 'service-account', password: 'secret-password' },
  },
  ssh: { label: 'SSH', fields: ['ssh_private_key'], placeholders: { ssh_private_key: '/keys/prod_box' } },
  proxy: { label: 'Proxy', fields: ['proxy_url'], placeholders: { proxy_url: 'http://proxy:8080' } },
}

export default function AddServerModal({ onClose, onCreate }) {
  const [form, setForm] = useState(EMPTY_SERVER)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function setCredential(field, value) {
    setForm((prev) => ({
      ...prev,
      auth_credentials: { ...prev.auth_credentials, [field]: value },
    }))
  }

  // Reset the credential bag whenever the auth method changes so stale fields
  // (e.g. a token left over from API Key) are never submitted for SSH/Proxy.
  function setAuthType(authType) {
    setForm((prev) => ({
      ...prev,
      auth_type: authType,
      auth_credentials: { [AUTH_META[authType].fields[0]]: '' },
    }))
  }

  async function handleSubmit(evt) {
    evt.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        environment: form.environment,
        auth_type: form.auth_type,
        auth_credentials: form.auth_credentials,
      }
      await onCreate(payload)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to create server')
    } finally {
      setSubmitting(false)
    }
  }

  const meta = AUTH_META[form.auth_type]

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add new server"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add new server</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <label className="mb-3 flex flex-col gap-1 text-xs font-medium text-slate-500">
          Server name
          <input
            required
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Staging API"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          />
        </label>

        <label className="mb-3 flex flex-col gap-1 text-xs font-medium text-slate-500">
          Environment
          <select
            value={form.environment}
            onChange={(e) => setForm((p) => ({ ...p, environment: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          >
            <option value="dev">dev</option>
            <option value="qa">qa</option>
            <option value="prod">prod</option>
          </select>
        </label>

        <label className="mb-3 flex flex-col gap-1 text-xs font-medium text-slate-500">
          Auth method
          <select
            value={form.auth_type}
            onChange={(e) => setAuthType(e.target.value)}
            data-testid="auth-type"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          >
            {Object.entries(AUTH_META).map(([value, m]) => (
              <option key={value} value={value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Dynamic credential fields — change with the selected auth method. */}
        <div className="mb-4 space-y-3 rounded-lg bg-slate-50 p-3">
          {meta.fields.map((field) => (
            <label key={field} className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              {field === 'password' ? 'Password' : field.replace(/_/g, ' ')}
              <input
                type={field === 'password' ? 'password' : 'text'} // v4 G9: mask the secret
                value={form.auth_credentials[field] ?? ''}
                onChange={(e) => setCredential(field, e.target.value)}
                placeholder={meta.placeholders[field]}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Add server'}
          </button>
        </div>
      </form>
    </div>
  )
}
