<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Dolibarr REST client for LectiHub free-trial intake.
 * Mirrors dolibarrClient.js.
 *
 * Enable with DOLIBARR_ENABLED=true
 *
 * Modes:
 *  log  – print payload to laravel.log (safe for local/dev)
 *  api  – POST thirdparty/invoice to Dolibarr REST
 *
 * Required env when mode=api:
 *  DOLIBARR_API_URL   e.g. https://host/dolibarr/api/index.php
 *  DOLIBARR_API_KEY   DOLAPIKEY header value
 */
class DolibarrClient
{
    public function __construct(
        private readonly SettingsService $settings,
    ) {}

    // -----------------------------------------------------------------------
    // Configuration helpers
    // -----------------------------------------------------------------------

    public function isEnabled(): bool
    {
        return strtolower((string) config('services.dolibarr.enabled', env('DOLIBARR_ENABLED', 'false'))) === 'true';
    }

    public function getMode(): string
    {
        $mode = strtolower((string) config('services.dolibarr.mode', env('DOLIBARR_MODE', '')));
        if ($mode === 'api' || $mode === 'log') {
            return $mode;
        }
        // Auto-detect: if both URL and key are set, prefer api.
        $hasApi = (bool) trim((string) config('services.dolibarr.api_url', ''))
               && (bool) trim((string) config('services.dolibarr.api_key', ''));
        return $hasApi ? 'api' : 'log';
    }

    private function apiBaseUrl(): string
    {
        return rtrim((string) config('services.dolibarr.api_url', env('DOLIBARR_API_URL', '')), '/');
    }

    private function apiKey(): string
    {
        return (string) config('services.dolibarr.api_key', env('DOLIBARR_API_KEY', ''));
    }

    /** Dolibarr typent_id: 8 = Individual, 2 = Company/Group */
    private function entityTypentId(string $entityType): int
    {
        if ($entityType === 'company') {
            return (int) env('DOLIBARR_TYPENT_COMPANY', 2);
        }
        return (int) env('DOLIBARR_TYPENT_INDIVIDUAL', 8);
    }

    // -----------------------------------------------------------------------
    // Payload builder
    // -----------------------------------------------------------------------

    /**
     * Build the thirdparty POST body from a free-trial descriptor.
     *
     * Expected keys in $trial:
     *   name, email, phone?, program, preferredDate, preferredSlot,
     *   videoPlatform (select key), videoPlatformLabel (human label), entityType
     *
     * Matches docs/dolibarr-free-trial.example.json + current Dolibarr field codes.
     *
     * @param  array<string,mixed>  $trial
     * @return array<string,mixed>
     */
    public function buildThirdpartyPayload(array $trial): array
    {
        $entityLabel   = ($trial['entityType'] ?? '') === 'company' ? 'Company' : 'Individual';
        $program       = $trial['program']           ?? '';
        $preferredDate = $trial['preferredDate']     ?? '';
        $timeSlot      = $trial['preferredSlot']     ?? '';
        $platform      = $trial['videoPlatformLabel'] ?? $trial['videoPlatform'] ?? '';

        $slotMinutes = (int) $this->settings->get('scheduling.slot_minutes', 30);
        if (! in_array($slotMinutes, [30, 60], true)) {
            $slotMinutes = 30;
        }

        $noteLines = array_filter([
            "LectiHub free trial ({$slotMinutes} minutes)",
            'Name: ' . ($trial['name']  ?? ''),
            'Email: ' . ($trial['email'] ?? ''),
            !empty($trial['phone']) ? 'Phone: ' . $trial['phone'] : null,
            "Company / Individual: {$entityLabel}",
            "Program: {$program}",
            "Preferred date: {$preferredDate}",
            "Preferred time slot: {$timeSlot}",
            "Preferred video platform: {$platform}",
        ]);

        $note = implode("\n", $noteLines);

        $payload = [
            'name'       => $trial['name']  ?? '',
            'email'      => $trial['email'] ?? '',
            'client'     => '2',
            'code_client'=> '-1',
            'name_alias' => $trial['email'] ?? '',
            'typent_id'  => $this->entityTypentId($trial['entityType'] ?? ''),
            'array_options' => [
                // Shared JSON example keys
                'options_program'        => $program,
                'options_preferred_date' => $preferredDate,
                'options_time_slot'      => $timeSlot,
                'options_video_platform' => $platform,
                // Current field codes on this Dolibarr instance
                'options_pref_date'      => $preferredDate,
                'options_pref_time'      => $timeSlot,
            ],
            'note_public'  => $note,
            'note_private' => $note,
        ];

        if (!empty($trial['phone'])) {
            $payload['phone'] = $trial['phone'];
        }

        return $payload;
    }

    // -----------------------------------------------------------------------
    // API transport
    // -----------------------------------------------------------------------

    /**
     * Execute an authenticated Dolibarr REST request.
     *
     * @param  array<string,mixed>|null  $body
     * @return mixed  Parsed JSON or null
     *
     * @throws RuntimeException on HTTP error
     */
    private function dolibarrFetch(string $path, string $method = 'GET', ?array $body = null): mixed
    {
        $base   = $this->apiBaseUrl();
        $apiKey = $this->apiKey();

        if (!$base || !$apiKey) {
            throw new RuntimeException(
                'Dolibarr API URL and API key are required for api mode',
                503
            );
        }

        $url = $base . '/' . ltrim($path, '/');

        $request = Http::withHeaders([
            'DOLAPIKEY'                  => $apiKey,
            'Accept'                     => 'application/json',
            'ngrok-skip-browser-warning' => 'true',
        ]);

        /** @var Response $response */
        $response = match (strtoupper($method)) {
            'POST'  => $request->post($url, $body ?? []),
            'PUT'   => $request->put($url, $body ?? []),
            default => $request->get($url),
        };

        if ($response->failed()) {
            $data   = $response->json();
            $detail = $data['error']['message'] ?? $data['message'] ?? $data['error']
                ?? substr($response->body(), 0, 280)
                ?: $response->reason();

            throw new RuntimeException(
                "Dolibarr API error ({$response->status()}): {$detail}",
                $response->status()
            );
        }

        return $response->json() ?? null;
    }

    // -----------------------------------------------------------------------
    // Public actions
    // -----------------------------------------------------------------------

    /**
     * Create a prospect thirdparty and return the new Dolibarr id.
     *
     * @param  array<string,mixed>  $trial
     *
     * @throws RuntimeException
     */
    public function createProspectThirdparty(array $trial): int
    {
        $payload = $this->buildThirdpartyPayload($trial);
        $result  = $this->dolibarrFetch('/thirdparties', 'POST', $payload);

        if (is_int($result) || is_numeric($result)) {
            return (int) $result;
        }
        if (is_array($result) && isset($result['id'])) {
            return (int) $result['id'];
        }

        throw new RuntimeException('Dolibarr did not return a thirdparty id', 502);
    }

    /**
     * Submit a free-trial lead to Dolibarr (or log it in log mode).
     *
     * @param  array<string,mixed>  $trial
     * @return array{mode: string, thirdpartyId: ?int, ticketId: null, payload?: array}
     *
     * @throws RuntimeException when DOLIBARR_ENABLED=false
     */
    public function submitFreeTrial(array $trial): array
    {
        if (!$this->isEnabled()) {
            throw new RuntimeException(
                'Dolibarr is not enabled. Set DOLIBARR_ENABLED=true.',
                503
            );
        }

        $mode    = $this->getMode();
        $payload = $this->buildThirdpartyPayload($trial);

        if ($mode === 'log') {
            Log::info('[dolibarr:log] POST /thirdparties', array_merge(
                $payload,
                ['submittedAt' => now()->toISOString()]
            ));
            return ['mode' => 'log', 'thirdpartyId' => null, 'ticketId' => null, 'payload' => $payload];
        }

        $thirdpartyId = $this->createProspectThirdparty($trial);
        return ['mode' => 'api', 'thirdpartyId' => $thirdpartyId, 'ticketId' => null];
    }

    /**
     * Best-effort customer invoice for a LectiHub payment receipt.
     * Returns the new invoice id, or null in log mode.
     *
     * @throws RuntimeException when DOLIBARR_ENABLED=false
     */
    public function createInvoiceForReceipt(
        int $thirdpartyId,
        float $amount,
        string $currency,
        string $receiptNumber,
        ?string $description = null,
        ?string $paidAt = null
    ): ?int {
        if (!$this->isEnabled()) {
            throw new RuntimeException('Dolibarr is not enabled', 503);
        }

        $desc = $description ?? "LectiHub payment receipt {$receiptNumber}";

        $payload = [
            'socid'        => $thirdpartyId,
            'type'         => 0,
            'note_public'  => "LectiHub receipt {$receiptNumber} · {$currency}",
            'note_private' => $desc,
            'lines'        => [[
                'desc'      => $desc,
                'subprice'  => $amount,
                'qty'       => 1,
                'tva_tx'    => 0,
            ]],
        ];

        if ($paidAt) {
            $ts = strtotime("{$paidAt}T12:00:00Z");
            if ($ts !== false) {
                $payload['date'] = $ts;
            }
        }

        if ($this->getMode() === 'log') {
            Log::info('[dolibarr:log] POST /invoices', $payload);
            return null;
        }

        $result = $this->dolibarrFetch('/invoices', 'POST', $payload);

        if (is_int($result) || is_numeric($result)) {
            return (int) $result;
        }
        if (is_array($result) && isset($result['id'])) {
            return (int) $result['id'];
        }

        return null;
    }
}
