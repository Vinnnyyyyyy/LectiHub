<?php

namespace App\Services;

use App\Models\LectiClass;
use App\Models\ScheduleRequest;
use App\Models\ScheduleRequestSlot;
use App\Models\User;
use Carbon\Carbon;

/**
 * Booking-specific helpers extracted from scheduleController.js.
 *
 * Covers: contiguous-block grouping, overlap detection, teacher scoring /
 * availability matrices, admin/student notifications, and the camelCase
 * request/teacher row mappers used by ScheduleRequestController.
 */
class ScheduleBookingService
{
    public const SUBJECTS = ['math', 'writing', 'science', 'english', 'history'];

    public function __construct(
        protected ScheduleMapper     $mapper,
        protected AvailabilityService $availability,
        protected ConflictService    $conflict,
        protected NotificationService $notifications,
    ) {}

    // -----------------------------------------------------------------------
    // Slot-key helpers (accept both camelCase and snake_case input)
    // -----------------------------------------------------------------------

    public function slotDate(array $slot): string
    {
        return $slot['preferredDate'] ?? $slot['preferred_date'] ?? '';
    }

    public function slotTime(array $slot): string
    {
        return $slot['timeSlot'] ?? $slot['time_slot'] ?? '';
    }

    public function sortSlots(array $slots): array
    {
        usort($slots, function ($a, $b) {
            $cmp = strcmp($this->slotDate($a), $this->slotDate($b));
            return $cmp !== 0 ? $cmp : strcmp($this->slotTime($a), $this->slotTime($b));
        });
        return $slots;
    }

    // -----------------------------------------------------------------------
    // Contiguous-block grouping  (mirrors groupContiguousBlocks)
    // -----------------------------------------------------------------------

    /**
     * Group sorted slots into runs of consecutive 30-min segments on the same
     * date, e.g. [09:30-10:00, 10:00-10:30] → one block.
     *
     * @param  array<array<string,mixed>>  $slots
     * @return array<array<array<string,mixed>>>
     */
    public function groupContiguousBlocks(array $slots): array
    {
        $sorted  = $this->sortSlots($slots);
        $blocks  = [];
        $current = [];

        foreach ($sorted as $slot) {
            if (empty($current)) {
                $current = [$slot];
                continue;
            }

            $prev       = $current[count($current) - 1];
            $prevParsed = $this->mapper->parseTimeSlot($this->slotTime($prev));
            $nextParsed = $this->mapper->parseTimeSlot($this->slotTime($slot));

            $contiguous = $this->slotDate($prev) === $this->slotDate($slot)
                && $prevParsed['endTime'] !== null
                && $nextParsed['startTime'] !== null
                && $prevParsed['endTime'] === $nextParsed['startTime'];

            if ($contiguous) {
                $current[] = $slot;
            } else {
                $blocks[] = $current;
                $current  = [$slot];
            }
        }

        if (!empty($current)) {
            $blocks[] = $current;
        }

        return $blocks;
    }

    // -----------------------------------------------------------------------
    // Block-window merger  (mirrors mergeBlockWindow)
    // -----------------------------------------------------------------------

    /**
     * Collapse a contiguous block into one window descriptor.
     *
     * @param  array<array<string,mixed>>  $slots
     * @return array{classDate: string, startTime: string, endTime: string, durationMinutes: int, timeSlot: string, firstSlotId: int|null, slotCount: int}
     */
    public function mergeBlockWindow(array $slots): array
    {
        $sorted      = $this->sortSlots($slots);
        $first       = $sorted[0];
        $last        = $sorted[count($sorted) - 1];
        $firstParsed = $this->mapper->parseTimeSlot($this->slotTime($first));
        $lastParsed  = $this->mapper->parseTimeSlot($this->slotTime($last));
        $startTime   = (string) $firstParsed['startTime'];
        $endTime     = (string) $lastParsed['endTime'];
        $merged      = $this->mapper->parseTimeSlot("{$startTime}-{$endTime}");

        return [
            'classDate'       => $this->slotDate($first),
            'startTime'       => $startTime,
            'endTime'         => $endTime,
            'durationMinutes' => $merged['durationMinutes'],
            'timeSlot'        => "{$startTime}-{$endTime}",
            'firstSlotId'     => $first['id'] ?? null,
            'slotCount'       => count($sorted),
        ];
    }

    // -----------------------------------------------------------------------
    // Student overlap check  (mirrors studentHasOverlappingBooking)
    // -----------------------------------------------------------------------

    /**
     * Returns 'pending' | 'scheduled' | null.
     */
    public function studentHasOverlappingBooking(
        int    $studentId,
        string $preferredDate,
        string $timeSlot
    ): ?string {
        $requested = $this->conflict->slotBounds($timeSlot);
        if ($requested === null) {
            return null;
        }

        // Pending schedule-request slots
        $pendingSlots = ScheduleRequestSlot::join(
            'schedule_requests',
            'schedule_requests.id',
            '=',
            'schedule_request_slots.request_id'
        )
            ->where('schedule_requests.student_id', $studentId)
            ->where('schedule_requests.status', 'pending')
            ->where('schedule_request_slots.preferred_date', $preferredDate)
            ->select('schedule_request_slots.time_slot')
            ->get();

        foreach ($pendingSlots as $row) {
            $existing = $this->conflict->slotBounds($row->time_slot);
            if ($existing && $this->conflict->rangesOverlap($requested, $existing)) {
                return 'pending';
            }
        }

        // Active classes
        $classRows = LectiClass::where('student_id', $studentId)
            ->where('class_date', $preferredDate)
            ->where('status', '!=', 'cancelled')
            ->select(['time_slot', 'start_time', 'end_time'])
            ->get();

        foreach ($classRows as $row) {
            $existing = ($row->start_time && $row->end_time)
                ? $this->conflict->slotBounds("{$row->start_time}-{$row->end_time}")
                : $this->conflict->slotBounds($row->time_slot);
            if ($existing && $this->conflict->rangesOverlap($requested, $existing)) {
                return 'scheduled';
            }
        }

        return null;
    }

    // -----------------------------------------------------------------------
    // Teacher candidate scoring  (mirrors buildTeacherCandidates)
    // -----------------------------------------------------------------------

    private function detectPreferredSubjects(?string $remarks): array
    {
        $text = strtolower((string) ($remarks ?? ''));
        return array_values(array_filter(self::SUBJECTS, fn ($s) => str_contains($text, $s)));
    }

    private function teacherWorkload(int $teacherId): int
    {
        return LectiClass::where('teacher_id', $teacherId)->count();
    }

    /**
     * @param  array<array<string,mixed>>  $slots
     * @return array{candidates: list<array<string,mixed>>, preferredSubjects: list<string>}
     */
    public function buildTeacherCandidates(array $slots, ?string $remarks): array
    {
        $teachers          = User::where('role', 'teacher')->orderBy('full_name')->orderBy('username')->get();
        $preferredSubjects = $this->detectPreferredSubjects($remarks);

        $candidates = $teachers->map(function (User $teacher) use ($slots, $remarks, $preferredSubjects) {
            $freeSlots = array_values(array_filter($slots, function ($slot) use ($teacher) {
                $date     = $this->slotDate($slot);
                $timeSlot = $this->slotTime($slot);
                return $this->availability->teacherOffersSlot($teacher->id, $date, $timeSlot)
                    && !$this->conflict->teacherHasConflict($teacher->id, $date, $timeSlot);
            }));

            $workload       = $this->teacherWorkload($teacher->id);
            $expertise      = trim((string) ($teacher->subject_expertise ?? ''));
            $expertiseLower = strtolower($expertise);

            $preferenceMatch = false;
            if (count($preferredSubjects) > 0) {
                foreach ($preferredSubjects as $subject) {
                    if (
                        str_contains($expertiseLower, $subject) ||
                        str_contains(strtolower((string) ($teacher->full_name ?? '')), $subject) ||
                        str_contains(strtolower($teacher->username), $subject)
                    ) {
                        $preferenceMatch = true;
                        break;
                    }
                }
            }

            $firstName     = explode(' ', strtolower((string) ($teacher->full_name ?? $teacher->username)))[0];
            $nameMentioned = $remarks !== null && $remarks !== ''
                && str_contains(strtolower((string) $remarks), $firstName);

            $fullyAvailable = count($freeSlots) === count($slots) && count($slots) > 0;

            $reasons = [];
            if ($fullyAvailable) {
                $reasons[] = 'Free for the full class block';
            } elseif (count($freeSlots) > 0) {
                $reasons[] = sprintf('Free for %d/%d segments only', count($freeSlots), count($slots));
            } else {
                $reasons[] = 'Not free for this class block';
            }
            if ($expertise) {
                $reasons[] = "Expertise: {$expertise}";
            }
            if ($preferenceMatch) {
                $reasons[] = 'Matches student subject preference';
            }
            if ($nameMentioned) {
                $reasons[] = 'Mentioned in student remarks';
            }
            $reasons[] = "Workload: {$workload} class(es)";

            $score  = count($freeSlots) * 20;
            $score += $fullyAvailable ? 25 : 0;
            $score += $preferenceMatch ? 30 : 0;
            $score += $nameMentioned ? 15 : 0;
            $score += max(0, 20 - $workload * 4);

            return [
                'id'                 => $teacher->id,
                'username'           => $teacher->username,
                'fullName'           => $teacher->full_name ?? $teacher->username,
                'email'              => $teacher->email ?? '',
                'subjectExpertise'   => $expertise,
                'workload'           => $workload,
                'availableSlotCount' => count($freeSlots),
                'fullyAvailable'     => $fullyAvailable,
                'preferenceMatch'    => $preferenceMatch || $nameMentioned,
                'assignable'         => $fullyAvailable,
                'freeSlots'          => array_map(fn ($s) => [
                    'id'            => $s['id'] ?? null,
                    'preferredDate' => $this->slotDate($s),
                    'timeSlot'      => $this->slotTime($s),
                ], $freeSlots),
                'matchReasons'       => $reasons,
                'suitabilityScore'   => $score,
            ];
        })->all();

        usort($candidates, function ($a, $b) {
            if ($a['assignable'] !== $b['assignable']) {
                return $a['assignable'] ? -1 : 1;
            }
            if ($b['suitabilityScore'] !== $a['suitabilityScore']) {
                return $b['suitabilityScore'] - $a['suitabilityScore'];
            }
            return $a['workload'] - $b['workload'];
        });

        return ['candidates' => $candidates, 'preferredSubjects' => $preferredSubjects];
    }

    // -----------------------------------------------------------------------
    // Slot-level availability matrix  (mirrors buildAvailability)
    // -----------------------------------------------------------------------

    /**
     * @param  array<array<string,mixed>>  $slots
     * @return array{slotAvailability: list<array>, fullyAvailableTeachers: list<array>, teacherCount: int, teacherCandidates: list<array>, preferredSubjects: list<string>}
     */
    public function buildAvailability(array $slots, ?string $remarks = ''): array
    {
        $teachers = User::where('role', 'teacher')->orderBy('full_name')->orderBy('username')->get();

        $slotAvailability = array_map(function ($slot) use ($teachers) {
            $date     = $this->slotDate($slot);
            $timeSlot = $this->slotTime($slot);
            $available   = [];
            $unavailable = [];

            foreach ($teachers as $teacher) {
                $offers   = $this->availability->teacherOffersSlot($teacher->id, $date, $timeSlot);
                $conflict = $offers
                    ? $this->conflict->teacherHasConflict($teacher->id, $date, $timeSlot)
                    : ['id' => null, 'title' => 'Outside teacher availability', 'class_date' => $date, 'time_slot' => $timeSlot];

                $summary = [
                    'id'               => $teacher->id,
                    'username'         => $teacher->username,
                    'fullName'         => $teacher->full_name ?? $teacher->username,
                    'email'            => $teacher->email ?? '',
                    'subjectExpertise' => $teacher->subject_expertise ?? '',
                    'workload'         => $this->teacherWorkload($teacher->id),
                ];

                if (!$offers || $conflict) {
                    $unavailable[] = array_merge($summary, [
                        'conflict' => [
                            'classId'   => $conflict['id']         ?? null,
                            'title'     => $conflict['title']       ?? 'Existing class',
                            'classDate' => $conflict['class_date']  ?? $date,
                            'timeSlot'  => $conflict['time_slot']   ?? $timeSlot,
                        ],
                    ]);
                } else {
                    $available[] = $summary;
                }
            }

            return [
                'id'                  => $slot['id'] ?? null,
                'preferredDate'       => $date,
                'timeSlot'            => $timeSlot,
                'availableTeachers'   => $available,
                'unavailableTeachers' => $unavailable,
            ];
        }, $slots);

        $fullyAvailableTeachers = $teachers->filter(function (User $teacher) use ($slots) {
            return count($slots) > 0 && collect($slots)->every(function ($slot) use ($teacher) {
                return $this->availability->teacherOffersSlot(
                    $teacher->id, $this->slotDate($slot), $this->slotTime($slot)
                ) && !$this->conflict->teacherHasConflict(
                    $teacher->id, $this->slotDate($slot), $this->slotTime($slot)
                );
            });
        })->map(fn (User $t) => [
            'id'               => $t->id,
            'username'         => $t->username,
            'fullName'         => $t->full_name ?? $t->username,
            'email'            => $t->email ?? '',
            'subjectExpertise' => $t->subject_expertise ?? '',
            'workload'         => $this->teacherWorkload($t->id),
        ])->values()->all();

        ['candidates' => $candidates, 'preferredSubjects' => $preferredSubjects] =
            $this->buildTeacherCandidates($slots, $remarks);

        return [
            'slotAvailability'       => $slotAvailability,
            'fullyAvailableTeachers' => $fullyAvailableTeachers,
            'teacherCount'           => $teachers->count(),
            'teacherCandidates'      => $candidates,
            'preferredSubjects'      => $preferredSubjects,
        ];
    }

    // -----------------------------------------------------------------------
    // Notification helpers  (mirrors notifyAdminsAboutRequests + scheduleStudentReminders)
    // -----------------------------------------------------------------------

    /**
     * @param  list<int>  $requestIds
     */
    public function notifyAdminsAboutRequests(array $requestIds, string $studentName, int $classCount): void
    {
        if (empty($requestIds)) {
            return;
        }

        $adminIds = User::where('role', 'admin')->pluck('id')->all();
        $title    = $classCount === 1
            ? 'New class booking'
            : "New class bookings ({$classCount})";
        $message  = $classCount === 1
            ? "{$studentName} booked a class awaiting teacher assignment."
            : "{$studentName} booked {$classCount} classes awaiting teacher assignment.";

        $this->notifications->notifyMany(
            $adminIds,
            'schedule_request',
            $title,
            $message,
            $requestIds[0],
            null,
            ['studentName' => $studentName, 'classCount' => $classCount, 'requestIds' => $requestIds]
        );
    }

    /**
     * Queue 24-hour and 1-hour in-app reminders for a student.
     *
     * @param  array{teacherName: string, classDate: string, startTime: string, endTime: string, durationMinutes: int, meetingInfo: string, meetingLink: string}  $scheduleDetails
     */
    public function scheduleStudentReminders(
        int   $studentId,
        int   $requestId,
        int   $classId,
        array $scheduleDetails
    ): void {
        $startTime = $scheduleDetails['startTime'] ?? '09:00';
        $classDate = $scheduleDetails['classDate'] ?? '';

        try {
            $classStart = Carbon::createFromFormat('Y-m-d H:i', "{$classDate} {$startTime}");
        } catch (\Throwable) {
            return;
        }

        $now     = Carbon::now();
        $windows = [
            ['key' => '24h', 'seconds' => 86400, 'label' => '24 hours'],
            ['key' => '1h',  'seconds' => 3600,  'label' => '1 hour'],
        ];

        foreach ($windows as $window) {
            $deliverAtDate = $classStart->copy()->subSeconds($window['seconds']);
            $deliverAt     = $deliverAtDate->lte($now) ? null : $deliverAtDate->format('Y-m-d H:i:s');

            $reminderMessage = implode("\n", [
                "Reminder: your class begins in {$window['label']}.",
                "Assigned teacher: {$scheduleDetails['teacherName']}",
                "Schedule: {$classDate} {$scheduleDetails['startTime']} – {$scheduleDetails['endTime']} ({$scheduleDetails['durationMinutes']} minutes)",
                "Meeting information: {$scheduleDetails['meetingInfo']}",
                "Meeting link: {$scheduleDetails['meetingLink']}",
            ]);

            $this->notifications->createNotification(
                $studentId,
                'class_reminder',
                "Class reminder · {$window['label']} before",
                $reminderMessage,
                $requestId,
                $classId,
                array_merge($scheduleDetails, [
                    'reminderWindow' => $window['key'],
                    'reminderLabel'  => $window['label'],
                ]),
                $deliverAt
            );
        }
    }

    // -----------------------------------------------------------------------
    // Row mappers (mirrors mapTeacher / mapRequest from scheduleController.js)
    // -----------------------------------------------------------------------

    public function mapTeacher(?User $teacher): ?array
    {
        if (!$teacher) {
            return null;
        }
        return [
            'id'               => $teacher->id,
            'username'         => $teacher->username,
            'fullName'         => $teacher->full_name ?? $teacher->username,
            'email'            => $teacher->email ?? '',
            'subjectExpertise' => $teacher->subject_expertise ?? '',
        ];
    }

    /**
     * Map a ScheduleRequest model + its slot rows to the camelCase shape the
     * Vue front-end expects.
     *
     * @param  array<array{id: int, preferred_date: string, time_slot: string}>  $slots
     */
    public function mapRequestRow(
        ScheduleRequest $request,
        array           $slots,
        ?User           $student        = null,
        ?User           $assignedTeacher = null
    ): array {
        $assignedSlot = $request->assigned_slot_id
            ? collect($slots)->first(fn ($s) => ($s['id'] ?? null) == $request->assigned_slot_id)
            : null;

        $studentShape = $student ? [
            'id'       => $student->id,
            'username' => $student->username,
            'fullName' => $student->full_name ?? $student->username,
            'email'    => $student->email ?? '',
        ] : null;

        return [
            'id'                       => $request->id,
            'studentId'                => $request->student_id,
            'student'                  => $studentShape,
            'remarks'                  => $request->remarks ?? '',
            'status'                   => $request->status,
            'source'                   => $request->source ?? 'student',
            'program'                  => $request->program,
            'entityType'               => $request->entity_type,
            'preferredMeetingProvider' => $request->preferred_meeting_provider,
            'dolibarrThirdpartyId'     => $request->dolibarr_thirdparty_id,
            'dolibarrTicketId'         => $request->dolibarr_ticket_id,
            'createdAt'                => $request->created_at,
            'assignedTeacherId'        => $request->assigned_teacher_id,
            'assignedTeacher'          => $this->mapTeacher($assignedTeacher),
            'assignedSlotId'           => $request->assigned_slot_id,
            'assignedSlot'             => $assignedSlot ? [
                'id'            => $assignedSlot['id'],
                'preferredDate' => $assignedSlot['preferred_date'],
                'timeSlot'      => $assignedSlot['time_slot'],
            ] : null,
            'assignedAt'               => $request->assigned_at,
            'slots'                    => array_map(fn ($s) => [
                'id'            => $s['id'],
                'preferredDate' => $s['preferred_date'],
                'timeSlot'      => $s['time_slot'],
            ], $slots),
        ];
    }

    /**
     * Load and return ordered slot rows for a request.
     *
     * @return array<array{id: int, preferred_date: string, time_slot: string}>
     */
    public function getSlotsForRequest(int $requestId): array
    {
        return ScheduleRequestSlot::where('request_id', $requestId)
            ->orderBy('preferred_date')
            ->orderBy('time_slot')
            ->get()
            ->map(fn ($s) => [
                'id'             => $s->id,
                'preferred_date' => $s->preferred_date,
                'time_slot'      => $s->time_slot,
            ])
            ->all();
    }
}
