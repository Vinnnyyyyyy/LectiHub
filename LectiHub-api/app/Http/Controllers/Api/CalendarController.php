<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CalendarSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    public function __construct(
        private readonly CalendarSyncService $calendar
    ) {}

    /**
     * GET /calendar
     *
     * Return the authenticated user's calendar events, calendar connections
     * (teachers only), and available provider flags.
     *
     * Response shape: { events, connections, providers }
     */
    public function getMyCalendar(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        $events      = $this->calendar->listEventsForUser($user->id);
        $connections = $user->role === 'teacher'
            ? $this->calendar->listConnections($user->id)
            : [];

        return response()->json([
            'events'      => $events,
            'connections' => $connections,
            'providers'   => [
                'google' => [
                    'available' => true,
                    'liveSync'  => strtolower((string) env('GOOGLE_CALENDAR_ENABLED', 'false')) === 'true',
                ],
                'calendly' => [
                    'available' => true,
                    'liveSync'  => strtolower((string) env('CALENDLY_ENABLED', 'false')) === 'true',
                ],
            ],
        ]);
    }

    /**
     * POST /calendar/connect
     *
     * Connect (or update) an external calendar provider for the authenticated
     * teacher.  Only teachers may connect calendars.
     *
     * Body: { provider, accessToken?, refreshToken?, externalAccount?, calendarId?, schedulingUrl? }
     * Response 201: { message, connection }
     */
    public function connectCalendarProvider(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        if ($user->role !== 'teacher') {
            return response()->json(
                ['message' => 'Only teachers can connect external calendars'],
                403
            );
        }

        $provider = strtolower(trim((string) ($request->input('provider') ?? '')));
        if (! in_array($provider, ['google', 'calendly'], true)) {
            return response()->json(
                ['message' => 'provider must be google or calendly'],
                400
            );
        }

        $externalAccount = $request->input('externalAccount')
            ?? $request->input('email')
            ?? "{$provider}-account-{$user->id}";

        $connection = $this->calendar->upsertConnection($user->id, $provider, [
            'accessToken'    => $request->input('accessToken'),
            'refreshToken'   => $request->input('refreshToken'),
            'externalAccount'=> $externalAccount,
            'calendarId'     => $request->input('calendarId')
                ?? ($provider === 'google' ? 'primary' : null),
            'schedulingUrl'  => $request->input('schedulingUrl'),
        ]);

        return response()->json([
            'message'    => "{$provider} calendar connected",
            'connection' => $this->calendar->mapConnection($connection),
        ], 201);
    }

    /**
     * DELETE /calendar/connect/{provider}
     *
     * Soft-disconnect an external calendar provider (sets is_active = false).
     * Only teachers may disconnect calendars.
     *
     * Response: { message }
     */
    public function disconnectCalendarProvider(Request $request, string $provider): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        if ($user->role !== 'teacher') {
            return response()->json(
                ['message' => 'Only teachers can disconnect external calendars'],
                403
            );
        }

        $provider = strtolower(trim($provider));
        if (! in_array($provider, ['google', 'calendly'], true)) {
            return response()->json(
                ['message' => 'provider must be google or calendly'],
                400
            );
        }

        $this->calendar->disconnectProvider($user->id, $provider);

        return response()->json(['message' => "{$provider} calendar disconnected"]);
    }
}
