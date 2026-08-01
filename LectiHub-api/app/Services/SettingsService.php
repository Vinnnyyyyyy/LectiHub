<?php

namespace App\Services;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\QueryException;
use Throwable;

/**
 * Centre settings as a typed key/value store.
 *
 * Every key has a default here, so a fresh install behaves sensibly with an
 * empty table and reading a key that was never written never returns null.
 * Several of these values are currently duplicated in the frontend
 * (constants/timeSlots.ts) and in AvailabilityService — this is meant to
 * become the single source.
 */
class SettingsService
{
    public const DEFAULTS = [
        // Scheduling rules
        'scheduling.slot_minutes'               => 30,
        'scheduling.opening_time'               => '09:00',
        'scheduling.closing_time'               => '18:00',
        'scheduling.lunch_start'                => '12:00',
        'scheduling.lunch_end'                  => '13:00',
        'scheduling.min_notice_hours'           => 48,
        'scheduling.auto_approve_single_match'  => false,

        // Reminders & notifications
        'reminders.class_reminder_hours'        => [24, 1],
        'reminders.notify_on_decision'          => true,
        'reminders.notify_teacher_on_assignment' => true,
        'reminders.request_feedback_after_report' => true,
        'reminders.alert_admin_on_absence'      => true,

        // Meetings
        'meetings.default_provider'             => 'google_meet',
        'meetings.enabled_providers'            => ['google_meet', 'zoom', 'jitsi', 'digital_samba'],

        // Centre profile & records
        'center.name'                           => 'LectiHub Learning Center',
        'center.timezone'                       => 'Asia/Manila',
        'center.term_start'                     => null,
        'center.term_end'                       => null,
        'records.audit_retention_months'        => 24,
    ];

    /** Keys a non-admin is allowed to read — the booking screen needs these. */
    public const PUBLIC_KEYS = [
        'scheduling.slot_minutes',
        'scheduling.opening_time',
        'scheduling.closing_time',
        'scheduling.lunch_start',
        'scheduling.lunch_end',
        'scheduling.min_notice_hours',
        'meetings.default_provider',
        'meetings.enabled_providers',
        'center.name',
        'center.timezone',
    ];

    /** Everything, defaults overlaid with whatever has been saved. */
    public function all(): array
    {
        try {
            $stored = Setting::pluck('value', 'key')->all();
        } catch (Throwable $e) {
            // Fresh installs (or DBs that have not run the settings migration)
            // should still open System settings with the built-in defaults.
            if ($this->isMissingSettingsTable($e)) {
                return self::DEFAULTS;
            }
            throw $e;
        }

        $out = [];
        foreach (self::DEFAULTS as $key => $default) {
            $out[$key] = array_key_exists($key, $stored) ? $this->unwrap($stored[$key]) : $default;
        }

        return $out;
    }

    public function public(): array
    {
        $all = $this->all();

        return array_intersect_key($all, array_flip(self::PUBLIC_KEYS));
    }

    public function get(string $key, mixed $fallback = null): mixed
    {
        if (! array_key_exists($key, self::DEFAULTS)) {
            return $fallback;
        }

        try {
            $row = Setting::where('key', $key)->first();
        } catch (Throwable $e) {
            if ($this->isMissingSettingsTable($e)) {
                return self::DEFAULTS[$key];
            }
            throw $e;
        }

        return $row ? $this->unwrap($row->value) : self::DEFAULTS[$key];
    }

    private function isMissingSettingsTable(Throwable $e): bool
    {
        if (! $e instanceof QueryException) {
            return false;
        }

        $message = $e->getMessage();

        return str_contains($message, 'no such table')
            || str_contains($message, "doesn't exist")
            || str_contains($message, 'does not exist')
            || str_contains($message, 'Undefined table');
    }

    /**
     * Writes only known keys. Returns the keys that were actually applied so
     * the caller can tell the difference between "saved" and "ignored".
     */
    public function setMany(array $values, ?User $actor = null): array
    {
        $applied = [];

        foreach ($values as $key => $value) {
            if (! array_key_exists($key, self::DEFAULTS)) {
                continue;
            }

            $coerced = $this->coerce($key, $value);
            if ($coerced === null && self::DEFAULTS[$key] !== null) {
                continue; // failed the type check — leave the stored value alone
            }

            Setting::updateOrCreate(
                ['key' => $key],
                // Wrapped so scalars survive the json column round-trip.
                ['value' => ['v' => $coerced], 'updated_by' => $actor?->id],
            );

            $applied[] = $key;
        }

        return $applied;
    }

    private function unwrap(mixed $stored): mixed
    {
        return is_array($stored) && array_key_exists('v', $stored) ? $stored['v'] : $stored;
    }

    /** Coerces to the shape of the default; null means "rejected". */
    private function coerce(string $key, mixed $value): mixed
    {
        $default = self::DEFAULTS[$key];

        if (is_bool($default)) {
            return is_bool($value) ? $value : filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        }

        if (is_int($default)) {
            return is_numeric($value) ? (int) $value : null;
        }

        if (is_array($default)) {
            return is_array($value) ? array_values($value) : null;
        }

        // Strings and nullable strings (term dates). Blank means null, which
        // setMany then stores for nullable keys and rejects for the rest —
        // so center.name cannot be emptied but term dates can be cleared.
        if ($value === null || $value === '') {
            return null;
        }

        return is_scalar($value) ? (string) $value : null;
    }
}
