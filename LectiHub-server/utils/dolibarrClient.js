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
 * This Dolibarr instance uses select extrafields with these option keys:
 * - program: p1 / p2
 * - pref_time: slot1 / slot2
 * - video_platform: zoom / gmeet
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

/** Map LectiHub program labels → Dolibarr select keys (Program 1 / Program 2). */
function mapProgramOption(program) {
  const value = String(program || '').trim();
  const byLabel = {
    'Program 1': 'p1',
    'Program 2': 'p2',
    'English Conversation': 'p1',
    'Math Tutoring': 'p2',
    'Coding Basics': 'p1',
    'Exam Prep': 'p2',
    Other: 'p1',
  };
  if (byLabel[value]) return byLabel[value];
  if (value === 'p1' || value === 'p2') return value;
  return 'p1';
}

/**
 * Map LectiHub 30-min slots → Dolibarr pref_time select keys.
 * Dolibarr currently only has:
 *   slot1 = 09:00 - 10:00
 *   slot2 = 14:00 - 15:00
 */
function mapTimeSlotOption(preferredSlot) {
  const slot = String(preferredSlot || '').trim();
  if (slot === 'slot1' || slot === 'slot2') return slot;
  const start = slot.split('-')[0] || '';
  const hour = Number(String(start).split(':')[0]);
  if (Number.isFinite(hour) && hour >= 12) return 'slot2';
  return 'slot1';
}

/** Map LectiHub video providers → Dolibarr select keys (zoom / gmeet). */
function mapVideoPlatformOption(videoPlatform, videoPlatformLabel) {
  const raw = String(videoPlatform || '').toLowerCase().trim();
  const label = String(videoPlatformLabel || '').toLowerCase().trim();
  if (raw === 'zoom' || label === 'zoom') return 'zoom';
  if (
    raw === 'google_meet' ||
    raw === 'gmeet' ||
    label.includes('google meet') ||
    label === 'gmeet'
  ) {
    return 'gmeet';
  }
  // Dolibarr select currently only has zoom + gmeet; keep a valid key.
  if (raw === 'jitsi' || label.includes('jitsi')) return 'gmeet';
  if (raw === 'digital_samba' || label.includes('samba')) return 'zoom';
  return 'zoom';
}

function entityTypentId(entityType) {
  // Common Dolibarr dictionary: 8 = Private individual, 2 = Company/Group
  if (entityType === 'company') {
    return Number(process.env.DOLIBARR_TYPENT_COMPANY || 2);
  }
  return Number(process.env.DOLIBARR_TYPENT_INDIVIDUAL || 8);
}

function buildThirdpartyPayload(trial) {
  const entityLabel = trial.entityType === 'company' ? 'Company' : 'Individual';
  const programKey = mapProgramOption(trial.program);
  const timeKey = mapTimeSlotOption(trial.preferredSlot);
  const videoKey = mapVideoPlatformOption(trial.videoPlatform, trial.videoPlatformLabel);

  const note = [
    'LectiHub free trial (30 minutes)',
    `Name: ${trial.name}`,
    `Email: ${trial.email}`,
    trial.phone ? `Phone: ${trial.phone}` : null,
    `Company / Individual: ${entityLabel}`,
    `Program: ${trial.program} (${programKey})`,
    `Preferred date: ${trial.preferredDate}`,
    `Preferred time slot: ${trial.preferredSlot} → ${timeKey}`,
    `Preferred video platform: ${trial.videoPlatformLabel || trial.videoPlatform} (${videoKey})`,
  ]
    .filter(Boolean)
    .join('\n');

  const payload = {
    name: trial.name,
    // Shows in Dolibarr "Alias name" column
    name_alias: trial.email,
    email: trial.email,
    client: '2', // Prospect
    code_client: '-1', // Auto-generate customer code
    typent_id: entityTypentId(trial.entityType),
    array_options: {
      options_program: programKey,
      options_pref_date: trial.preferredDate,
      options_pref_time: timeKey,
      options_video_platform: videoKey,
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
  mapProgramOption,
  mapTimeSlotOption,
  mapVideoPlatformOption,
  submitFreeTrialToDolibarr,
};
