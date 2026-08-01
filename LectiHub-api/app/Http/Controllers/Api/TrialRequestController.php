<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AvailabilityService;
use App\Services\ScheduleMapper;
use App\Services\SettingsService;
use App\Services\TrialSchedulerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class TrialRequestController extends Controller
{
    // -----------------------------------------------------------------------
    // Static config (mirrors trialController.js)
    // -----------------------------------------------------------------------

    private const PROGRAMS = [
        'Data Analytics',
        'English Conversation',
        'Math Tutoring',
        'Coding Basics',
        'Exam Prep',
        'Other',
    ];

    private const VIDEO_PLATFORMS = [
        'zoom'          => 'Zoom',
        'google_meet'   => 'Google Meet',
        'digital_samba' => 'Digital Samba',
        'jitsi'         => 'Jitsi',
    ];

    public function __construct(
        private readonly TrialSchedulerService $scheduler,
        private readonly AvailabilityService $availability,
        private readonly SettingsService $settings,
        private readonly ScheduleMapper $mapper,
    ) {}

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private function isValidEmail(string $value): bool
    {
        return (bool) filter_var($value, FILTER_VALIDATE_EMAIL);
    }

    private function isValidDate(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        $d = \DateTime::createFromFormat('Y-m-d', $value);

        return $d && $d->format('Y-m-d') === $value;
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    /**
     * GET /trial-requests/config  (public)
     *
     * Returns the static configuration for the free-trial booking form:
     * programs, time slots, and video platforms.
     */
    public function getTrialConfig(): JsonResponse
    {
        $timeSlots   = $this->availability->standardTimeSlots();
        $slotMinutes = (int) $this->settings->get('scheduling.slot_minutes', 30);
        if (! in_array($slotMinutes, [30, 60], true)) {
            $slotMinutes = 30;
        }

        $enabled        = $this->mapper->enabledMeetingProviders();
        $videoPlatforms = [];
        foreach ($enabled as $value) {
            if (isset(self::VIDEO_PLATFORMS[$value])) {
                $videoPlatforms[] = ['value' => $value, 'label' => self::VIDEO_PLATFORMS[$value]];
            }
        }
        if ($videoPlatforms === []) {
            $videoPlatforms = array_map(
                fn ($value, $label) => ['value' => $value, 'label' => $label],
                array_keys(self::VIDEO_PLATFORMS),
                array_values(self::VIDEO_PLATFORMS)
            );
        }

        return response()->json([
            'enabled'         => true,
            'durationMinutes' => $slotMinutes,
            'programs'        => self::PROGRAMS,
            'timeSlots'       => $timeSlots,
            'videoPlatforms'  => $videoPlatforms,
            'message'         => 'Free trial posts to the E-Scheduler assign queue.',
        ]);
    }

    /**
     * POST /trial-requests  (public)
     *
     * Submit a free-trial booking request into the E-Scheduler review queue.
     *
     * Response 201: { message, schedule: { requestId, studentId } }
     */
    public function createFreeTrialRequest(Request $request): JsonResponse
    {
        $name          = trim((string) ($request->input('name') ?? ''));
        $email         = trim((string) ($request->input('email') ?? ''));
        $entityTypeRaw = strtolower(trim((string) ($request->input('entityType') ?? '')));
        $program       = trim((string) ($request->input('program') ?? ''));
        $preferredDate = trim((string) ($request->input('preferredDate') ?? ''));
        $preferredSlot = trim((string) ($request->input('preferredSlot') ?? ''));
        $videoPlatform = strtolower(trim((string) ($request->input('videoPlatform') ?? '')));
        $phone         = trim((string) ($request->input('phone') ?? ''));

        if (! $name || mb_strlen($name) < 2) {
            return response()->json(['message' => 'Enter your name.'], 400);
        }
        if (! $this->isValidEmail($email)) {
            return response()->json(['message' => 'Enter a valid email address.'], 400);
        }

        $entityType = in_array($entityTypeRaw, ['company', 'individual'], true) ? $entityTypeRaw : null;
        if (! $entityType) {
            return response()->json(['message' => 'Choose Company or Individual.'], 400);
        }

        if (! in_array($program, self::PROGRAMS, true)) {
            return response()->json(['message' => 'Choose a valid program.'], 400);
        }
        if (! $this->isValidDate($preferredDate)) {
            return response()->json(['message' => 'Choose a valid preferred date.'], 400);
        }
        if (! in_array($preferredSlot, $this->availability->standardTimeSlots(), true)) {
            return response()->json(['message' => 'Choose a valid time slot.'], 400);
        }
        if (! isset(self::VIDEO_PLATFORMS[$videoPlatform]) || ! $this->mapper->isEnabledMeetingProvider($videoPlatform)) {
            return response()->json([
                'message' => 'Choose an enabled video platform.',
            ], 400);
        }

        $earliest = $this->availability->earliestBookableDate();
        $latest   = $this->availability->latestBookableDate();
        if ($preferredDate < $earliest) {
            return response()->json([
                'message' => "Preferred date must be on or after {$earliest}.",
            ], 400);
        }
        if ($latest !== null && $preferredDate > $latest) {
            return response()->json([
                'message' => "Preferred date must be on or before {$latest}.",
            ], 400);
        }

        $trial = [
            'name'               => mb_substr($name, 0, 120),
            'email'              => strtolower(mb_substr($email, 0, 180)),
            'phone'              => $phone ? mb_substr($phone, 0, 40) : null,
            'entityType'         => $entityType,
            'companyName'        => $entityType === 'company' ? mb_substr($name, 0, 120) : null,
            'program'            => $program,
            'preferredDate'      => $preferredDate,
            'preferredSlot'      => $preferredSlot,
            'videoPlatform'      => $videoPlatform,
            'videoPlatformLabel' => self::VIDEO_PLATFORMS[$videoPlatform],
        ];

        try {
            $schedule = $this->scheduler->createTrialScheduleRequest($trial);
        } catch (Throwable $e) {
            $status = method_exists($e, 'getCode') && $e->getCode() >= 400 && $e->getCode() < 600
                ? (int) $e->getCode()
                : 500;

            return response()->json(
                ['message' => $e->getMessage() ?: 'Could not submit free trial request'],
                $status
            );
        }

        return response()->json([
            'message'  => 'Free trial request received. Saved to the E-Scheduler review queue.',
            'schedule' => [
                'requestId' => $schedule['requestId'],
                'studentId' => $schedule['studentId'],
            ],
        ], 201);
    }
}
