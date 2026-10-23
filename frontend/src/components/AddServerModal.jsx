import { useState } from 'react'
import '../styles/components/modal.css'

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
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add new server"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="modal"
      >
        <div className="modal__head">
          <h2 className="modal__title">Add new server</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="modal__close">
            ✕
          </button>
        </div>

        <div className="modal__body">
          <label className="modal__field">
            <span className="modal__label">Server name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Staging API"
              className="modal__input"
            />
          </label>

          <label className="modal__field">
            <span className="modal__label">Environment</span>
            <select
              value={form.environment}
              onChange={(e) => setForm((p) => ({ ...p, environment: e.target.value }))}
              className="modal__select"
            >
              <option value="dev">dev</option>
              <option value="qa">qa</option>
              <option value="prod">prod</option>
            </select>
          </label>

          <label className="modal__field">
            <span className="modal__label">Auth method</span>
            <select
              value={form.auth_type}
              onChange={(e) => setAuthType(e.target.value)}
              data-testid="auth-type"
              className="modal__select"
            >
              {Object.entries(AUTH_META).map(([value, m]) => (
                <option key={value} value={value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          {/* Dynamic credential fields — change with the selected auth method. */}
          <div className="modal__creds">
            {meta.fields.map((field) => (
              <label key={field} className="modal__field">
                <span className="modal__label">
                  {field === 'password' ? 'Password' : field.replace(/_/g, ' ')}
                </span>
                <input
                  type={field === 'password' ? 'password' : 'text'} // mask the secret
                  value={form.auth_credentials[field] ?? ''}
                  onChange={(e) => setCredential(field, e.target.value)}
                  placeholder={meta.placeholders[field]}
                  className="modal__input"
                />
              </label>
            ))}
          </div>

          {error && (
            <p role="alert" className="modal__error">
              {error}
            </p>
          )}
        </div>

        <div className="modal__foot">
          <button type="button" onClick={onClose} className="modal__btn">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="modal__btn modal__btn--primary"
          >
            {submitting ? 'Saving…' : 'Add server'}
          </button>
        </div>
      </form>
    </div>
  )
}
