/**
 * Dolibarr REST client for LectiHub free-trial intake.
 *
 * Enable with DOLIBARR_ENABLED=true
 *
 * Modes:
 * - log : print the payload to the server console (safe for local/dev)
 * - api : POST prospect thirdparty to Dolibarr REST
 *
 * Env (never commit real keys — use LectiHub-server/.env):
 * - DOLIBARR_API_URL  e.g. https://host/dolibarr/api/index.php
 * - DOLIBARR_API_KEY  DOLAPIKEY header value
 */

function isDolibarrEnabled() {
  return String(process.env.DOLIBARR_ENABLED || '').toLowerCase() === 'true';
}

function getDolibarrMode() {
  const mode = String(process.env.DOLIBARR_MODE || '').toLowerCase();
  if (mode === 'api' || mode === 'log') return mode;
  const hasApi =
    Boolean(String(process.env.DOLIBARR_API_URL || '').trim()) &&
    Boolean(String(process.env.DOLIBARR_API_KEY || '').trim());
  return hasApi ? 'api' : 'log';
}

function getApiBaseUrl() {
  return String(process.env.DOLIBARR_API_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function getApiKey() {
  return String(process.env.DOLIBARR_API_KEY || '').trim();
}

function buildThirdpartyPayload(trial) {
  return {
    name: trial.name,
    email: trial.email,
    client: '2', // Prospect
    code_client: '-1', // Auto-generate customer code
    array_options: {
      options_program: trial.program,
      options_preferred_date: trial.preferredDate,
      options_time_slot: trial.preferredSlot,
      options_video_platform: trial.videoPlatformLabel,
    },
  };
}

async function dolibarrFetch(path, { method = 'GET', body } = {}) {
  const base = getApiBaseUrl();
  const apiKey = getApiKey();
  if (!base || !apiKey) {
    const err = new Error('Dolibarr API URL and API key are required for api mode');
    err.status = 503;
    throw err;
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    DOLAPIKEY: apiKey,
    Accept: 'application/json',
    // Required when the Dolibarr host is behind ngrok free (skips interstitial page).
    'ngrok-skip-browser-warning': 'true',
  };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail =
      (data && (data.error?.message || data.message || data.error)) ||
      (typeof data === 'string' ? data.slice(0, 280) : null) ||
      response.statusText;
    const err = new Error(`Dolibarr API error (${response.status}): ${detail}`);
    err.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    err.dolibarr = data;
    throw err;
  }

  return data;
}

async function createProspectThirdparty(trial) {
  const payload = buildThirdpartyPayload(trial);

  const result = await dolibarrFetch('/thirdparties', {
    method: 'POST',
    body: payload,
  });

  // API may return bare id or object
  if (typeof result === 'number') return result;
  if (result && typeof result === 'object' && result.id != null) return Number(result.id);
  const parsed = Number(result);
  if (Number.isFinite(parsed)) return parsed;

  const err = new Error('Dolibarr did not return a thirdparty id');
  err.status = 502;
  throw err;
}

/**
 * Submit a free-trial lead to Dolibarr (or log it in log mode).
 * POSTs a Prospect thirdparty with free-trial extrafields in array_options.
 * @returns {Promise<{ mode: string, thirdpartyId?: number|null, ticketId?: null, payload?: object }>}
 */
async function submitFreeTrialToDolibarr(trial) {
  if (!isDolibarrEnabled()) {
    const err = new Error(
      'Dolibarr is not enabled. Set DOLIBARR_ENABLED=true on the API server.',
    );
    err.status = 503;
    throw err;
  }

  const mode = getDolibarrMode();
  const payload = buildThirdpartyPayload(trial);

  if (mode === 'log') {
    console.log('[dolibarr:log] POST /thirdparties', {
      ...payload,
      submittedAt: new Date().toISOString(),
    });
    return { mode: 'log', thirdpartyId: null, ticketId: null, payload };
  }

  const thirdpartyId = await createProspectThirdparty(trial);

  return {
    mode: 'api',
    thirdpartyId,
    ticketId: null,
    payload,
  };
}

module.exports = {
  isDolibarrEnabled,
  getDolibarrMode,
  buildThirdpartyPayload,
  submitFreeTrialToDolibarr,
};
