function getDolibarrConfig() {
  const enabled = String(process.env.DOLIBARR_ENABLED || 'false').toLowerCase() === 'true';
  const baseUrl = String(process.env.DOLIBARR_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const paymentPath = String(
    process.env.DOLIBARR_PAYMENT_PATH || '/public/payment/newpayment.php',
  ).trim();
  const defaultAmount = Number(process.env.DOLIBARR_DEFAULT_AMOUNT || 0);
  const currency = String(process.env.DOLIBARR_CURRENCY || 'USD').trim().toUpperCase() || 'USD';
  const paymentMethod = String(process.env.DOLIBARR_PAYMENT_METHOD || '').trim();
  const allowCustomAmount =
    String(process.env.DOLIBARR_ALLOW_CUSTOM_AMOUNT || 'true').toLowerCase() !== 'false';
  const websiteRef = String(process.env.DOLIBARR_WEBSITE_REF || '').trim();

  return {
    enabled,
    baseUrl,
    paymentPath,
    defaultAmount: Number.isFinite(defaultAmount) && defaultAmount > 0 ? defaultAmount : null,
    currency,
    paymentMethod: paymentMethod || null,
    allowCustomAmount,
    websiteRef: websiteRef || null,
    configured: enabled && Boolean(baseUrl),
  };
}

function slugTagPart(value, max = 24) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

function buildPaymentUrl({ amount, tag, invoiceRef }) {
  const config = getDolibarrConfig();
  if (!config.configured) {
    const err = new Error('Dolibarr payment is not configured');
    err.status = 503;
    throw err;
  }

  const path = config.paymentPath.startsWith('/')
    ? config.paymentPath
    : `/${config.paymentPath}`;
  const url = new URL(`${config.baseUrl}${path}`);

  if (invoiceRef) {
    url.searchParams.set('source', 'invoice');
    url.searchParams.set('ref', invoiceRef);
  } else {
    url.searchParams.set('amount', Number(amount).toFixed(2));
    url.searchParams.set('tag', tag);
  }

  if (config.paymentMethod) {
    url.searchParams.set('paymentmethod', config.paymentMethod);
  }
  if (config.websiteRef) {
    url.searchParams.set('ws', config.websiteRef);
  }

  return url.toString();
}

async function getPaymentConfig(req, res) {
  try {
    const config = getDolibarrConfig();
    res.json({
      enabled: config.configured,
      currency: config.currency,
      defaultAmount: config.defaultAmount,
      allowCustomAmount: config.allowCustomAmount,
      paymentMethod: config.paymentMethod,
      provider: 'dolibarr',
      message: config.configured
        ? 'Dolibarr online payment is ready.'
        : 'Set DOLIBARR_ENABLED=true and DOLIBARR_BASE_URL on the API server to enable payments.',
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading payment config', error: err.message });
  }
}

async function createDolibarrPaymentLink(req, res) {
  try {
    const config = getDolibarrConfig();
    if (!config.configured) {
      return res.status(503).json({
        message:
          'Dolibarr payment is not configured. Set DOLIBARR_ENABLED=true and DOLIBARR_BASE_URL.',
      });
    }

    const invoiceRef =
      typeof req.body?.invoiceRef === 'string' ? req.body.invoiceRef.trim() : '';
    const purpose =
      typeof req.body?.purpose === 'string' ? req.body.purpose.trim().slice(0, 120) : '';
    let amount = req.body?.amount != null ? Number(req.body.amount) : config.defaultAmount;

    if (!invoiceRef) {
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Enter a valid payment amount greater than 0.' });
      }
      if (!config.allowCustomAmount && config.defaultAmount != null) {
        amount = config.defaultAmount;
      }
      if (amount > 100000) {
        return res.status(400).json({ message: 'Amount is too large.' });
      }
    }

    const username = slugTagPart(req.user.username || `user${req.user.id}`, 20);
    const purposeSlug = slugTagPart(purpose || 'lesson', 28) || 'lesson';
    const stamp = Date.now().toString(36);
    const tag = `LH-${req.user.id}-${username}-${purposeSlug}-${stamp}`.slice(0, 128);

    const paymentUrl = buildPaymentUrl({
      amount,
      tag,
      invoiceRef: invoiceRef || null,
    });

    res.json({
      message: 'Dolibarr payment link ready',
      paymentUrl,
      amount: invoiceRef ? null : Number(amount.toFixed(2)),
      currency: config.currency,
      tag: invoiceRef ? null : tag,
      invoiceRef: invoiceRef || null,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Could not create payment link' });
  }
}

module.exports = {
  getPaymentConfig,
  createDolibarrPaymentLink,
};
