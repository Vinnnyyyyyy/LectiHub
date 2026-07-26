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
 *
 * Payload matches docs/dolibarr-free-trial.example.json:
 *   name, email, client "2", code_client "-1",
 *   array_options.options_program / preferred_date / time_slot / video_platform
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

function entityTypentId(entityType) {
  // Common Dolibarr dictionary: 8 = Private individual, 2 = Company/Group
  if (entityType === 'company') {
    return Number(process.env.DOLIBARR_TYPENT_COMPANY || 2);
  }
  return Number(process.env.DOLIBARR_TYPENT_INDIVIDUAL || 8);
}

/**
 * Build the Dolibarr thirdparty body from a free-trial form submission.
 * Spec keys (preferred_date / time_slot) match the shared JSON example.
 * pref_date / pref_time are also set for this Dolibarr instance's current codes.
 */
function buildThirdpartyPayload(trial) {
  const entityLabel = trial.entityType === 'company' ? 'Company' : 'Individual';
  const program = trial.program;
  const preferredDate = trial.preferredDate;
  const timeSlot = trial.preferredSlot;
  const videoPlatform = trial.videoPlatformLabel || trial.videoPlatform;

  const note = [
    'LectiHub free trial (30 minutes)',
    `Name: ${trial.name}`,
    `Email: ${trial.email}`,
    trial.phone ? `Phone: ${trial.phone}` : null,
    `Company / Individual: ${entityLabel}`,
    `Program: ${program}`,
    `Preferred date: ${preferredDate}`,
    `Preferred time slot: ${timeSlot}`,
    `Preferred video platform: ${videoPlatform}`,
  ]
    .filter(Boolean)
    .join('\n');

  const payload = {
    name: trial.name,
    email: trial.email,
    client: '2',
    code_client: '-1',
    // Extra visibility in the Third parties list
    name_alias: trial.email,
    typent_id: entityTypentId(trial.entityType),
    array_options: {
      // Shared JSON example keys
      options_program: program,
      options_preferred_date: preferredDate,
      options_time_slot: timeSlot,
      options_video_platform: videoPlatform,
      // Current field codes on this Dolibarr (list columns Program / pref_date / pref_time / video_platform)
      options_pref_date: preferredDate,
      options_pref_time: timeSlot,
    },
    note_public: note,
    note_private: note,
  };

  if (trial.phone) {
    payload.phone = trial.phone;
  }

  return payload;
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

/**
 * Best-effort Dolibarr customer invoice for a LectiHub payment receipt.
 * Returns invoice id or null in log mode.
 */
async function createInvoiceForReceipt({
  thirdpartyId,
  amount,
  currency,
  receiptNumber,
  description,
  paidAt,
}) {
  if (!isDolibarrEnabled()) {
    const err = new Error('Dolibarr is not enabled');
    err.status = 503;
    throw err;
  }

  const payload = {
    socid: Number(thirdpartyId),
    type: 0,
    note_public: `LectiHub receipt ${receiptNumber} · ${currency || 'USD'}`,
    note_private: description || `LectiHub payment receipt ${receiptNumber}`,
    lines: [
      {
        desc: description || `LectiHub payment ${receiptNumber}`,
        subprice: Number(amount),
        qty: 1,
        tva_tx: 0,
      },
    ],
  };

  if (paidAt) {
    // Dolibarr accepts unix timestamp for date on many versions
    const ts = Math.floor(new Date(`${paidAt}T12:00:00Z`).getTime() / 1000);
    if (Number.isFinite(ts)) payload.date = ts;
  }

  if (getDolibarrMode() === 'log') {
    console.log('[dolibarr:log] POST /invoices', payload);
    return null;
  }

  const result = await dolibarrFetch('/invoices', {
    method: 'POST',
    body: payload,
  });

  if (typeof result === 'number') return result;
  if (result && typeof result === 'object' && result.id != null) return Number(result.id);
  const parsed = Number(result);
  if (Number.isFinite(parsed)) return parsed;
  return null;
}

module.exports = {
  isDolibarrEnabled,
  getDolibarrMode,
  buildThirdpartyPayload,
  submitFreeTrialToDolibarr,
  createInvoiceForReceipt,
};
