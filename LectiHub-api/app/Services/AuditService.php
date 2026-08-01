<?php

namespace App\Services;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Writes the audit trail. Recording must never be the reason a request
 * fails, so every write is wrapped — a lost log line is preferable to a
 * failed assignment or a half-deleted account.
 */
class AuditService
{
    public function __construct(
        private readonly SettingsService $settings,
    ) {}

    public function record(
        string $category,
        string $action,
        string $description,
        ?User $actor = null,
        ?string $entityType = null,
        ?int $entityId = null,
        array $metadata = [],
    ): ?AuditEvent {
        try {
            return AuditEvent::create([
                'actor_id'    => $actor?->id,
                'actor_name'  => $actor ? ($actor->full_name ?: $actor->username) : 'System',
                'category'    => $category,
                'action'      => $action,
                'description' => $description,
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'metadata'    => $metadata ?: null,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Audit write failed: ' . $e->getMessage(), [
                'category' => $category,
                'action'   => $action,
            ]);

            return null;
        }
    }

    /**
     * Delete audit rows older than the centre retention window.
     *
     * @return int number of rows deleted
     */
    public function pruneExpired(?int $months = null): int
    {
        $months = $months ?? (int) $this->settings->get('records.audit_retention_months', 24);
        if ($months < 1) {
            return 0;
        }

        try {
            $cutoff = now()->subMonths($months);

            return AuditEvent::where('created_at', '<', $cutoff)->delete();
        } catch (\Throwable $e) {
            Log::warning('Audit prune failed: ' . $e->getMessage());

            return 0;
        }
    }
}
