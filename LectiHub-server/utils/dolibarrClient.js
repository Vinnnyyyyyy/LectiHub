/**
 * Dolibarr REST client for LectiHub free-trial intake.
 *
 * Enable with DOLIBARR_ENABLED=true
 *
 * Modes:
 * - log : print the payload to the server console (safe for local/dev)
 * - api : POST to Dolibarr REST (thirdparty prospect + ticket)
 *
 * Env:
 * - DOLIBARR_API_URL  e.g. https://crm.example.com/api/index.php
 * - DOLIBARR_API_KEY  user API token (DOLAPIKEY header)
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
      (typeof data === 'string' ? data : null) ||
      response.statusText;
    const err = new Error(`Dolibarr API error (${response.status}): ${detail}`);
    err.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    err.dolibarr = data;
    throw err;
  }

  return data;
}

async function findThirdpartyIdByEmail(email) {
  const safeEmail = String(email || '')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  try {
    const filter = encodeURIComponent(`(t.email:=:'${safeEmail}')`);
    const rows = await dolibarrFetch(
      `/thirdparties?limit=1&sortfield=t.rowid&sortorder=ASC&sqlfilters=${filter}`,
    );
    if (Array.isArray(rows) && rows.length > 0 && rows[0].id != null) {
      return Number(rows[0].id);
    }
  } catch {
    // Search is best-effort; create a new prospect if lookup fails.
  }
  return null;
}

async function createProspectThirdparty(trial) {
  const isCompany = trial.entityType === 'company';
  const name = isCompany
    ? trial.companyName || trial.name
    : trial.name;

  const payload = {
    name,
    email: trial.email,
    client: 2, // prospect
    code_client: 'auto',
    status: 1,
    note_private: [
      'LectiHub free trial lead',
      `Contact: ${trial.name}`,
      `Entity: ${isCompany ? 'Company' : 'Individual'}`,
      trial.companyName ? `Company: ${trial.companyName}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  };

  if (isCompany) {
    payload.typent_id = 2; // Company (common Dolibarr default; ignored if invalid)
  }

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

function buildTicketMessage(trial) {
  return [
    'LectiHub free trial request (30 minutes)',
    '',
    `Name: ${trial.name}`,
    `Email: ${trial.email}`,
    `Company / Individual: ${trial.entityType === 'company' ? 'Company' : 'Individual'}`,
    trial.companyName ? `Company name: ${trial.companyName}` : null,
    `Program: ${trial.program}`,
    `Preferred date: ${trial.preferredDate}`,
    `Preferred time slot: ${trial.preferredSlot}`,
    `Preferred video platform: ${trial.videoPlatformLabel}`,
    '',
    'Source: LectiHub free-trial web form',
  ]
    .filter((line) => line != null)
    .join('\n');
}

async function createTrialTicket(trial, socid) {
  const typeCode = String(process.env.DOLIBARR_TICKET_TYPE_CODE || 'COM').trim() || 'COM';
  const categoryCode =
    String(process.env.DOLIBARR_TICKET_CATEGORY_CODE || 'OTHER').trim() || 'OTHER';
  const severityCode =
    String(process.env.DOLIBARR_TICKET_SEVERITY_CODE || 'NORMAL').trim() || 'NORMAL';

  const payload = {
    subject: `Free trial 30 min — ${trial.name} — ${trial.program}`,
    message: buildTicketMessage(trial),
    type_code: typeCode,
    category_code: categoryCode,
    severity_code: severityCode,
    email: trial.email,
  };

  if (socid) {
    payload.fk_soc = socid;
    payload.socid = socid;
  }

  const result = await dolibarrFetch('/tickets', {
    method: 'POST',
    body: payload,
  });

  if (typeof result === 'number') return { id: result };
  if (result && typeof result === 'object') {
    return { id: result.id ?? result.track_id ?? null, raw: result };
  }
  return { id: result };
}

/**
 * Submit a free-trial lead to Dolibarr (or log it in log mode).
 * @returns {Promise<{ mode: string, thirdpartyId?: number|null, ticketId?: * }>}
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

  if (mode === 'log') {
    console.log('[dolibarr:log] Free trial lead', {
      ...trial,
      submittedAt: new Date().toISOString(),
    });
    return { mode: 'log', thirdpartyId: null, ticketId: null };
  }

  let thirdpartyId = await findThirdpartyIdByEmail(trial.email);
  if (!thirdpartyId) {
    thirdpartyId = await createProspectThirdparty(trial);
  }

  const ticket = await createTrialTicket(trial, thirdpartyId);

  return {
    mode: 'api',
    thirdpartyId,
    ticketId: ticket.id,
  };
}

module.exports = {
  isDolibarrEnabled,
  getDolibarrMode,
  submitFreeTrialToDolibarr,
};
