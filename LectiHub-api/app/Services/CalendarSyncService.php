<?php

namespace App\Services;

use App\Models\CalendarConnection;
use App\Models\CalendarEvent;
use App\Models\LectiClass;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Creates local calendar events when a class is assigned and optionally
 * pushes them to external providers (Google Calendar, Calendly).
 * Mirrors calendarService.js.
 */
class CalendarSyncService
{
    // -----------------------------------------------------------------------
    // Connection helpers
    // -----------------------------------------------------------------------

    /**
     * Return the active CalendarConnection row for a user+provider, or null.
     */
    public function getConnection(int $userId, string $provider): ?CalendarConnection
    {
        return CalendarConnection::where('user_id', $userId)
            ->where('provider', $provider)
            ->where('is_active', true)
            ->first();
    }

    /**
     * Return all CalendarConnections for a user (mapped to camelCase arrays).
     *
     * @return array<int, array<string,mixed>>
     */
    public function listConnections(int $userId): array
    {
        return CalendarConnection::where('user_id', $userId)
            ->orderBy('provider')
            ->get()
            ->map(fn ($row) => $this->mapConnection($row))
            ->all();
    }

    /**
     * Upsert a calendar connection.
     *
     * @param  array{
     *   accessToken?: string|null,
     *   refreshToken?: string|null,
     *   externalAccount?: string|null,
     *   calendarId?: string|null,
     *   schedulingUrl?: string|null
     * }  $payload
     */
    public function upsertConnection(int $userId, string $provider, array $payload = []): CalendarConnection
    {
        /** @var CalendarConnection $connection */
        $connection = CalendarConnection::updateOrCreate(
            ['user_id' => $userId, 'provider' => $provider],
            [
                'access_token'    => $payload['accessToken']     ?? null,
                'refresh_token'   => $payload['refreshToken']    ?? null,
                'external_account'=> $payload['externalAccount'] ?? null,
                'calendar_id'     => $payload['calendarId']      ?? null,
                'scheduling_url'  => $payload['schedulingUrl']   ?? null,
                'is_active'       => true,
                'connected_at'    => now(),
            ]
        );

        return $connection;
    }

    /**
     * Soft-disconnect a provider (is_active = false).
     */
    public function disconnectProvider(int $userId, string $provider): void
    {
        CalendarConnection::where('user_id', $userId)
            ->where('provider', $provider)
            ->update(['is_active' => false]);
    }

    // -----------------------------------------------------------------------
    // Local event creation
    // -----------------------------------------------------------------------

    /**
     * Insert a local calendar event for one user linked to a class.
     *
     * @param  LectiClass|array<string,mixed>  $classRow
     */
    public function createLocalCalendarEvent(
        int $userId,
        LectiClass|array $classRow,
        array $extras = []
    ): CalendarEvent {
        $get = fn ($key) => $classRow instanceof LectiClass
            ? $classRow->{$key}
            : ($classRow[$key] ?? null);

        $timeSlot  = (string) ($get('time_slot') ?? '');
        $slotParts = explode('-', $timeSlot, 2);
        $startTime = $get('start_time') ?? ($slotParts[0] ?? '09:00');
        $endTime   = $get('end_time')   ?? ($slotParts[1] ?? '10:00');

        $title = $extras['title']
            ?? $get('title')
            ?? ('LectiHub class on ' . $get('class_date'));

        $descParts = array_filter([
            $get('subject')      ? 'Subject: ' . $get('subject') : null,
            $get('meeting_info') ?: null,
            $get('meeting_link') ? 'Meeting link: ' . $get('meeting_link') : null,
        ]);

        return CalendarEvent::create([
            'user_id'          => $userId,
            'class_id'         => $get('id'),
            'title'            => $title,
            'description'      => implode("\n", $descParts),
            'event_date'       => $get('class_date'),
            'start_time'       => $startTime,
            'end_time'         => $endTime,
            'duration_minutes' => $get('duration_minutes') ?? 60,
            'meeting_info'     => $get('meeting_info') ?? '',
            'meeting_link'     => $get('meeting_link') ?? '',
            'provider'         => 'lectihub',
            'sync_status'      => 'local_only',
        ]);
    }

    /**
     * Update a calendar event's external sync metadata.
     */
    public function markExternalSync(
        int $eventId,
        string $provider,
        ?string $externalEventId,
        string $status = 'synced'
    ): CalendarEvent {
        CalendarEvent::where('id', $eventId)->update([
            'provider'          => $provider,
            'external_event_id' => $externalEventId,
            'sync_status'       => $status,
            'synced_at'         => now(),
        ]);

        return CalendarEvent::findOrFail($eventId);
    }

    // -----------------------------------------------------------------------
    // External sync stubs (Google / Calendly)
    // -----------------------------------------------------------------------

    /**
     * Push a local event to Google Calendar.
     * Falls back to a simulated sync when GOOGLE_CALENDAR_ENABLED is not set.
     *
     * @param  LectiClass|array<string,mixed>  $classRow
     */
    public function syncToGoogle(
        CalendarConnection $connection,
        LectiClass|array $classRow,
        CalendarEvent $localEvent
    ): CalendarEvent {
        $googleEnabled = strtolower((string) env('GOOGLE_CALENDAR_ENABLED', 'false')) === 'true';
        $get           = fn ($key) => $classRow instanceof LectiClass
            ? $classRow->{$key}
            : ($classRow[$key] ?? null);

        if ($googleEnabled && $connection->access_token) {
            $calendarId = $connection->calendar_id ?? 'primary';
            $start      = $get('class_date') . 'T' . ($get('start_time') ?? '09:00') . ':00';
            $end        = $get('class_date') . 'T' . ($get('end_time')   ?? '10:00') . ':00';

            try {
                $response = Http::withToken($connection->access_token)
                    ->post(
                        'https://www.googleapis.com/calendar/v3/calendars/'
                        . urlencode($calendarId) . '/events',
                        [
                            'summary'     => $localEvent->title,
                            'description' => $localEvent->description,
                            'start'       => ['dateTime' => $start],
                            'end'         => ['dateTime' => $end],
                            'location'    => $get('meeting_info') ?: null,
                        ]
                    );

                if ($response->successful()) {
                    $data       = $response->json();
                    $externalId = $data['id'] ?? "google-{$localEvent->id}";
                    return $this->markExternalSync($localEvent->id, 'google', $externalId, 'synced');
                }

                Log::error('[calendar:google] ' . $response->status() . ' ' . $response->body());
                return $this->markExternalSync($localEvent->id, 'google', null, 'failed');
            } catch (\Throwable $e) {
                Log::error('[calendar:google] ' . $e->getMessage());
                return $this->markExternalSync($localEvent->id, 'google', null, 'failed');
            }
        }

        // Simulated sync for local dev
        $externalId = 'google-sim-' . $localEvent->id . '-' . time();
        Log::info('[calendar:google:sim]', [
            'account'    => $connection->external_account,
            'event'      => $localEvent->title,
            'externalId' => $externalId,
        ]);
        return $this->markExternalSync($localEvent->id, 'google', $externalId, 'synced');
    }

    /**
     * Soft-connect to Calendly (Calendly is invitee-driven; we just record a marker).
     * Falls back to a simulated sync when CALENDLY_ENABLED is not set.
     *
     * @param  LectiClass|array<string,mixed>  $classRow
     */
    public function syncToCalendly(
        CalendarConnection $connection,
        LectiClass|array $classRow,
        CalendarEvent $localEvent
    ): CalendarEvent {
        $calendlyEnabled = strtolower((string) env('CALENDLY_ENABLED', 'false')) === 'true';
        $get             = fn ($key) => $classRow instanceof LectiClass
            ? $classRow->{$key}
            : ($classRow[$key] ?? null);

        if ($calendlyEnabled && $connection->access_token) {
            try {
                $response = Http::withToken($connection->access_token)
                    ->get('https://api.calendly.com/scheduled_events');

                if (!$response->successful()) {
                    throw new \RuntimeException("Calendly API error: {$response->status()}");
                }

                $externalId = 'calendly-' . $localEvent->id . '-' . $get('class_date');
                return $this->markExternalSync($localEvent->id, 'calendly', $externalId, 'synced');
            } catch (\Throwable $e) {
                Log::error('[calendar:calendly] ' . $e->getMessage());
                return $this->markExternalSync($localEvent->id, 'calendly', null, 'failed');
            }
        }

        $externalId = 'calendly-sim-' . $localEvent->id . '-' . time();
        Log::info('[calendar:calendly:sim]', [
            'account'      => $connection->external_account,
            'schedulingUrl'=> $connection->scheduling_url,
            'event'        => $localEvent->title,
            'externalId'   => $externalId,
        ]);
        return $this->markExternalSync($localEvent->id, 'calendly', $externalId, 'synced');
    }

    // -----------------------------------------------------------------------
    // Main sync action
    // -----------------------------------------------------------------------

    /**
     * Create local calendar events for student + teacher on class assign, then
     * push to any external providers the teacher has connected.
     *
     * @param  LectiClass|array<string,mixed>  $classRow
     * @return array{
     *   studentEvent: CalendarEvent,
     *   teacherEvent: CalendarEvent,
     *   externalSync: list<array{provider: string, status: string, event: CalendarEvent}>
     * }
     */
    public function syncClassToCalendars(
        LectiClass|array $classRow,
        int $studentId,
        int $teacherId
    ): array {
        $result = [
            'studentEvent' => null,
            'teacherEvent' => null,
            'externalSync' => [],
        ];

        $baseTitle = ($classRow instanceof LectiClass ? $classRow->title : ($classRow['title'] ?? null))
            ?? 'Confirmed LectiHub class';

        $result['studentEvent'] = $this->createLocalCalendarEvent(
            $studentId, $classRow, ['title' => $baseTitle]
        );
        $result['teacherEvent'] = $this->createLocalCalendarEvent(
            $teacherId, $classRow, ['title' => $baseTitle]
        );

        // Google
        $google = $this->getConnection($teacherId, 'google');
        if ($google) {
            $googleLocal = $this->createLocalCalendarEvent(
                $teacherId, $classRow, ['title' => "[Google] {$baseTitle}"]
            );
            $synced = $this->syncToGoogle($google, $classRow, $googleLocal);
            $result['externalSync'][] = [
                'provider' => 'google',
                'status'   => $synced->sync_status,
                'event'    => $synced,
            ];
        }

        // Calendly
        $calendly = $this->getConnection($teacherId, 'calendly');
        if ($calendly) {
            $calendlyLocal = $this->createLocalCalendarEvent(
                $teacherId, $classRow, ['title' => "[Calendly] {$baseTitle}"]
            );
            $synced = $this->syncToCalendly($calendly, $classRow, $calendlyLocal);
            $result['externalSync'][] = [
                'provider' => 'calendly',
                'status'   => $synced->sync_status,
                'event'    => $synced,
            ];
        }

        return $result;
    }

    // -----------------------------------------------------------------------
    // Event listing
    // -----------------------------------------------------------------------

    /**
     * @return array<int, array<string,mixed>>
     */
    public function listEventsForUser(int $userId): array
    {
        return CalendarEvent::where('user_id', $userId)
            ->orderBy('event_date')
            ->orderBy('start_time')
            ->get()
            ->map(fn ($row) => $this->mapEvent($row))
            ->all();
    }

    // -----------------------------------------------------------------------
    // Internal mappers
    // -----------------------------------------------------------------------

    /**
     * @return array<string,mixed>
     */
    public function mapConnection(CalendarConnection $row): array
    {
        return [
            'id'              => $row->id,
            'userId'          => $row->user_id,
            'provider'        => $row->provider,
            'externalAccount' => $row->external_account ?? '',
            'calendarId'      => $row->calendar_id      ?? '',
            'schedulingUrl'   => $row->scheduling_url   ?? '',
            'isActive'        => (bool) $row->is_active,
            'connectedAt'     => $row->connected_at,
            'hasAccessToken'  => (bool) $row->access_token,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public function mapEvent(CalendarEvent $row): array
    {
        return [
            'id'              => $row->id,
            'userId'          => $row->user_id,
            'classId'         => $row->class_id,
            'title'           => $row->title,
            'description'     => $row->description     ?? '',
            'eventDate'       => $row->event_date,
            'startTime'       => $row->start_time,
            'endTime'         => $row->end_time,
            'durationMinutes' => $row->duration_minutes ?? 60,
            'meetingInfo'     => $row->meeting_info     ?? '',
            'meetingLink'     => $row->meeting_link     ?? '',
            'provider'        => $row->provider,
            'externalEventId' => $row->external_event_id ?? null,
            'syncStatus'      => $row->sync_status,
            'syncedAt'        => $row->synced_at        ?? null,
            'createdAt'       => $row->created_at,
        ];
    }
}
