<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditService;
use App\Services\AvailabilityService;
use App\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class SettingsController extends Controller
{
    /** Keys that redefine the bookable slot grid — teachers must be re-seeded. */
    private const SCHEDULE_SHAPE_KEYS = [
        'scheduling.slot_minutes',
        'scheduling.opening_time',
        'scheduling.closing_time',
        'scheduling.lunch_start',
        'scheduling.lunch_end',
    ];

    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly AvailabilityService $availability,
    ) {}

    /** GET /admin/settings */
    public function show(): JsonResponse
    {
        try {
            return response()->json([
                'settings' => $this->settings->all(),
                'defaults' => SettingsService::DEFAULTS,
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to read settings.', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /settings — the subset any signed-in user may read.
     * The booking screen needs slot length, opening hours and notice period.
     */
    public function publicSettings(): JsonResponse
    {
        try {
            return response()->json(['settings' => $this->settings->public()]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to read settings.', 'error' => $e->getMessage()], 500);
        }
    }

    /** PUT /admin/settings */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'settings' => ['required', 'array'],
        ]);

        try {
            $applied = $this->settings->setMany($data['settings'], $request->user());

            // Unknown or wrongly-typed keys are dropped rather than failing the
            // whole save; the response says which ones actually landed.
            $ignored = array_values(array_diff(array_keys($data['settings']), $applied));

            if ($applied) {
                $this->audit->record(
                    'settings',
                    'settings.updated',
                    'Centre settings updated — ' . implode(', ', $applied),
                    $request->user(),
                    'settings',
                    null,
                    ['applied' => $applied, 'ignored' => $ignored],
                );

                // Slot length / hours changes replace the bookable grid — refresh
                // teacher templates so students immediately see the new intervals.
                if (array_intersect($applied, self::SCHEDULE_SHAPE_KEYS)) {
                    $this->availability->seedAllTeachers();
                }
            }

            return response()->json([
                'message'  => $applied ? 'Settings saved.' : 'Nothing to save.',
                'applied'  => $applied,
                'ignored'  => $ignored,
                'settings' => $this->settings->all(),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to save settings.', 'error' => $e->getMessage()], 500);
        }
    }
}
