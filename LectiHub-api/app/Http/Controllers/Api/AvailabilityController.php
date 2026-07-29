<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AvailabilityService;
use App\Services\ConflictService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AvailabilityController extends Controller
{
    /**
     * Weekday reference list sent to the client.
     * Values 0–6 mirror the Express / Vue contract (0 = Sun, 6 = Sat).
     */
    private const WEEKDAYS = [
        ['value' => 0, 'label' => 'Sun'],
        ['value' => 1, 'label' => 'Mon'],
        ['value' => 2, 'label' => 'Tue'],
        ['value' => 3, 'label' => 'Wed'],
        ['value' => 4, 'label' => 'Thu'],
        ['value' => 5, 'label' => 'Fri'],
        ['value' => 6, 'label' => 'Sat'],
    ];

    public function __construct(
        protected AvailabilityService $availability,
        protected ConflictService     $conflict,
    ) {}

    // -----------------------------------------------------------------------
    // GET /availability/open  (?from=YYYY-MM-DD&to=YYYY-MM-DD)
    // -----------------------------------------------------------------------

    public function getOpenAvailability(Request $request): JsonResponse
    {
        try {
            $this->availability->seedAllTeachers();

            $defaults = $this->defaultRange();
            $earliest = $this->availability->earliestBookableDate();

            $from = substr((string) ($request->query('from') ?: $defaults['from']), 0, 10);
            $to   = substr((string) ($request->query('to')   ?: $defaults['to']),   0, 10);

            if (!$this->isValidIsoDate($from) || !$this->isValidIsoDate($to)) {
                return response()->json(['message' => 'from and to must be YYYY-MM-DD dates.'], 400);
            }

            if ($from < $earliest) {
                $from = $earliest;
            }

            if ($from > $to) {
                return response()->json(['message' => 'from must be on or before to.'], 400);
            }

            $teachers  = User::where('role', 'teacher')->orderBy('full_name')->orderBy('username')->get()->all();
            $inventory = $this->availability->buildOpenInventory(
                $from,
                $to,
                $teachers,
                fn ($tid, $date, $slot) => $this->conflict->teacherHasConflict($tid, $date, $slot) !== null
            );

            return response()->json(array_merge($inventory, [
                'earliestBookableDate' => $earliest,
                'bookingLeadDays'      => $this->availability->bookingLeadDays(),
            ]));
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Unable to load open teacher availability.',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /availability/mine  (teacher)
    // -----------------------------------------------------------------------

    public function getMyAvailability(Request $request): JsonResponse
    {
        try {
            $this->availability->seedAllTeachers();

            /** @var \App\Models\User $authUser */
            $authUser = $request->user();

            $slots = $this->availability->getTeacherWeeklyAvailability($authUser->id);

            return response()->json([
                'timeSlots' => AvailabilityService::STANDARD_TIME_SLOTS,
                'weekdays'  => self::WEEKDAYS,
                'slots'     => $slots,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Unable to load your availability.',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // -----------------------------------------------------------------------
    // PUT /availability/mine  (teacher)
    // -----------------------------------------------------------------------

    public function updateMyAvailability(Request $request): JsonResponse
    {
        try {
            $incoming = $request->input('slots');
            if (!is_array($incoming)) {
                return response()->json(['message' => 'slots array is required.'], 400);
            }

            /** @var \App\Models\User $authUser */
            $authUser = $request->user();
            $cleaned  = [];

            foreach ($incoming as $item) {
                $weekday  = isset($item['weekday']) ? (int) $item['weekday'] : null;
                $timeSlot = trim((string) ($item['timeSlot'] ?? $item['time_slot'] ?? ''));
                $isOpen   = !empty($item['isOpen']);

                if ($weekday === null || $weekday < 0 || $weekday > 6) {
                    return response()->json(['message' => 'weekday must be 0–6.'], 400);
                }
                if (!in_array($timeSlot, AvailabilityService::STANDARD_TIME_SLOTS, true)) {
                    $valid = implode(', ', AvailabilityService::STANDARD_TIME_SLOTS);
                    return response()->json(['message' => "timeSlot must be one of: {$valid}"], 400);
                }

                $cleaned[] = ['weekday' => $weekday, 'timeSlot' => $timeSlot, 'isOpen' => $isOpen];
            }

            $this->availability->replaceTeacherWeeklyAvailability($authUser->id, $cleaned);
            $slots = $this->availability->getTeacherWeeklyAvailability($authUser->id);

            return response()->json([
                'message'   => 'Availability updated.',
                'timeSlots' => AvailabilityService::STANDARD_TIME_SLOTS,
                'slots'     => $slots,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Unable to update your availability.',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private function defaultRange(): array
    {
        $start = $this->availability->earliestBookableDate();
        $end   = Carbon::parse($start)->addDays(60)->toDateString();
        return ['from' => $start, 'to' => $end];
    }

    private function isValidIsoDate(string $value): bool
    {
        try {
            CarbonImmutable::createFromFormat('Y-m-d', $value);
            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
