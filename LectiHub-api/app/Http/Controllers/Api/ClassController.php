<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LectiClass;
use App\Models\LessonReport;
use App\Models\StudentFeedback;
use App\Models\User;
use App\Services\ClassLifecycleService;
use App\Services\ScheduleMapper;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClassController extends Controller
{
    public function __construct(
        private readonly ScheduleMapper $mapper,
        private readonly ClassLifecycleService $lifecycle,
    ) {}

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Map a class model to the full camelCase presentation shape, including
     * lesson-report and feedback hydration fields (mirrors Express hydrateClass).
     */
    private function hydrateClass(LectiClass $class): array
    {
        $class->loadMissing(['teacher', 'student']);

        $mapped = $this->mapper->mapClassRow($class, $class->teacher, $class->student);

        $report = LessonReport::where('class_id', $class->id)
            ->select(['id', 'submitted_at'])
            ->first();

        $feedback = $report
            ? StudentFeedback::where('lesson_report_id', $report->id)
                ->select(['id', 'overall_rating', 'submitted_at'])
                ->first()
            : null;

        return array_merge($mapped, [
            'hasLessonReport'            => $report !== null,
            'lessonReportId'             => $report?->id,
            'lessonReportSubmittedAt'    => $report?->submitted_at,
            'hasStudentFeedback'         => $feedback !== null,
            'studentFeedbackId'          => $feedback?->id,
            'studentFeedbackRating'      => $feedback?->overall_rating ?? null,
            'studentFeedbackSubmittedAt' => $feedback?->submitted_at,
            'isFullyComplete'            => $report !== null && $feedback !== null,
        ]);
    }

    /**
     * Parse conduct-update fields from a request body.
     * Only keys that are actually present in $body are included in $updates,
     * mirroring the Express hasOwnProperty guard.
     *
     * @param  array<string,mixed>  $body
     * @return array{updates: array<string,mixed>, errors: list<string>}
     */
    private function parseConductBody(array $body): array
    {
        $errors  = [];
        $updates = [];

        if (array_key_exists('curriculumPlan', $body)) {
            $updates['curriculum_plan'] = trim((string) ($body['curriculumPlan'] ?? ''));
        }

        if (array_key_exists('attendanceStatus', $body)) {
            $raw = strtolower(trim((string) ($body['attendanceStatus'] ?? ''))) ?: 'not_recorded';
            if (!in_array($raw, ScheduleMapper::ATTENDANCE_STATUSES, true)) {
                $errors[] = 'attendanceStatus must be present, late, absent, excused, or not_recorded.';
            } else {
                $updates['attendance_status'] = $this->mapper->normalizeAttendanceStatus($raw);
                if ($raw !== 'not_recorded') {
                    $updates['attendance_recorded_at'] = Carbon::now();
                }
            }
        }

        if (array_key_exists('participationLevel', $body)) {
            $raw = strtolower(trim((string) ($body['participationLevel'] ?? ''))) ?: 'not_recorded';
            if (!in_array($raw, ScheduleMapper::PARTICIPATION_LEVELS, true)) {
                $errors[] = 'participationLevel must be low, medium, high, or not_recorded.';
            } else {
                $updates['participation_level'] = $this->mapper->normalizeParticipationLevel($raw);
            }
        }

        if (array_key_exists('participationNotes', $body)) {
            $updates['participation_notes'] = trim((string) ($body['participationNotes'] ?? ''));
        }

        if (array_key_exists('recordingUrl', $body)) {
            $url = trim((string) ($body['recordingUrl'] ?? ''));
            if ($url === '') {
                $updates['recording_url'] = '';
            } elseif (!$this->mapper->isValidHttpUrl($url)) {
                $errors[] = 'recordingUrl must be a valid http(s) URL.';
            } else {
                $updates['recording_url'] = $url;
            }
        }

        return ['updates' => $updates, 'errors' => $errors];
    }

    /**
     * Derive the class start-time string from a class model
     * (prefers explicit start_time, falls back to the first half of time_slot).
     */
    private function slotStartTime(LectiClass $class): string
    {
        if ($class->start_time) {
            return $class->start_time;
        }
        $parts = explode('-', (string) ($class->time_slot ?? ''), 2);
        return $parts[0] ?? '09:00';
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    /**
     * GET /api/classes
     * List upcoming / active classes for the authenticated user.
     * Filtered to scheduled + in_progress + completed (excludes cancelled).
     */
    public function listMyClasses(Request $request): JsonResponse
    {
        /** @var User $user */
        $user  = $request->user();
        $query = LectiClass::query()->orderBy('class_date')->orderBy('time_slot');

        if ($user->isStudent()) {
            $query->where('student_id', $user->id);
        } elseif ($user->isTeacher()) {
            $query->where('teacher_id', $user->id)->whereNotNull('student_id');
        } elseif ($user->isAdmin()) {
            // no extra filter
        } else {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $visible   = ['scheduled', 'in_progress', 'completed'];
        $schedules = $query->get()
            ->filter(fn (LectiClass $c) => in_array(
                $this->mapper->normalizeClassStatus($c->status),
                $visible,
                true
            ))
            ->map(fn (LectiClass $c) => $this->hydrateClass($c))
            ->values()
            ->all();

        return response()->json($schedules);
    }

    /**
     * GET /api/classes/history
     * Return archived classes (report + feedback both submitted).
     * Triggers finalization on any unarchived-but-ready classes first.
     */
    public function listClassHistory(Request $request): JsonResponse
    {
        // Finalize any classes that have both a report and feedback but are not archived yet.
        LectiClass::query()
            ->whereNull('archived_at')
            ->whereHas('lessonReport', fn ($q) => $q->whereHas('feedback'))
            ->select(['id'])
            ->get()
            ->each(fn (LectiClass $c) => $this->lifecycle->finalizeClassIfReady($c->id));

        /** @var User $user */
        $user  = $request->user();
        $query = LectiClass::query()
            ->whereNotNull('archived_at')
            ->orderByDesc('archived_at')
            ->orderByDesc('class_date')
            ->orderByDesc('id');

        if ($user->isStudent()) {
            $query->where('student_id', $user->id);
        } elseif ($user->isTeacher()) {
            $query->where('teacher_id', $user->id);
        } elseif ($user->isAdmin()) {
            // no extra filter
        } else {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $history = $query->get()
            ->map(function (LectiClass $class) {
                $item   = $this->hydrateClass($class);
                $report = LessonReport::where('class_id', $class->id)
                    ->select(['lesson_topic', 'student_progress', 'homework_assigned'])
                    ->first();

                return array_merge($item, [
                    'lessonTopic'      => $report?->lesson_topic ?: ($item['subject'] ?? $item['title'] ?? ''),
                    'studentProgress'  => $report?->student_progress ?? '',
                    'homeworkAssigned' => $report?->homework_assigned ?? '',
                ]);
            })
            ->values()
            ->all();

        return response()->json($history);
    }

    /**
     * GET /api/classes/by-request/{requestId}
     * Resolve the most recent confirmed class for a schedule request.
     */
    public function getClassByRequest(Request $request): JsonResponse
    {
        $requestId = (int) $request->route('requestId');
        if ($requestId < 1) {
            return response()->json(['message' => 'Invalid request id'], 400);
        }

        $class = LectiClass::query()
            ->where('schedule_request_id', $requestId)
            ->orderByDesc('id')
            ->first();

        if (!$class) {
            return response()->json(['message' => 'No confirmed schedule for this request'], 404);
        }

        /** @var User $user */
        $user = $request->user();
        if ($user->isStudent() && (int) $class->student_id !== $user->id) {
            return response()->json(['message' => 'Access denied'], 403);
        }
        if ($user->isTeacher() && (int) $class->teacher_id !== $user->id) {
            return response()->json(['message' => 'Access denied'], 403);
        }

        return response()->json($this->hydrateClass($class));
    }

    /**
     * POST /api/classes/{id}/join
     * Mark class as in_progress, build meeting details, auto-mark student present.
     */
    public function joinClass(Request $request): JsonResponse
    {
        $classId = (int) $request->route('id');
        if ($classId < 1) {
            return response()->json(['message' => 'A valid class id is required.'], 400);
        }

        $class = LectiClass::find($classId);
        if (!$class) {
            return response()->json(['message' => 'Class not found.'], 404);
        }

        /** @var User $user */
        $user          = $request->user();
        $isParticipant = (int) $class->student_id === $user->id || (int) $class->teacher_id === $user->id;

        if (!$isParticipant && !$user->isAdmin()) {
            return response()->json([
                'message' => 'Only the assigned student or teacher can join this class.',
            ], 403);
        }

        $status = $this->mapper->normalizeClassStatus($class->status);
        if ($status === 'cancelled' || $status === 'completed') {
            return response()->json([
                'message' => 'This class is ' . str_replace('_', ' ', $status) . ' and cannot be joined.',
                'class'   => $this->hydrateClass($class),
            ], 400);
        }

        if (!$this->mapper->getJoinAvailability($class)['canJoin']) {
            return response()->json([
                'message' => 'This class is not available to join yet. Please try again closer to the scheduled start time.',
                'class'   => $this->hydrateClass($class),
            ], 400);
        }

        $meetingLink     = trim((string) ($class->meeting_link ?? ''));
        $meetingInfo     = trim((string) ($class->meeting_info ?? ''));
        $meetingProvider = trim((string) ($class->meeting_provider ?? '')) ?: $this->mapper->getMeetingProvider();

        $rawProvider = $request->input('meetingProvider');
        $reqProvider = ($rawProvider !== null && trim((string) $rawProvider) !== '')
            ? strtolower(trim((string) $rawProvider))
            : null;

        if ($reqProvider !== null) {
            if (!in_array($reqProvider, ScheduleMapper::VIDEO_PROVIDERS, true)) {
                return response()->json([
                    'message' => 'meetingProvider must be jitsi, google_meet, or zoom.',
                ], 400);
            }
            $meeting     = $this->mapper->buildMeetingDetails(
                $class->schedule_request_id ?? $classId,
                $class->class_date,
                $this->slotStartTime($class),
                $reqProvider,
            );
            $meetingLink     = $meeting['meetingLink'];
            $meetingInfo     = $meeting['meetingInfo'];
            $meetingProvider = $meeting['meetingProvider'];
        } elseif (!$meetingLink) {
            $meeting     = $this->mapper->buildMeetingDetails(
                $class->schedule_request_id ?? $classId,
                $class->class_date,
                $this->slotStartTime($class),
                $meetingProvider,
            );
            $meetingLink     = $meeting['meetingLink'];
            $meetingInfo     = $meeting['meetingInfo'];
            $meetingProvider = $meeting['meetingProvider'];
        }

        $wasInProgress    = $status === 'in_progress';
        $now              = Carbon::now();
        $isStudentJoining = (int) $class->student_id === $user->id;
        $currentAtt       = $this->mapper->normalizeAttendanceStatus($class->attendance_status);
        $markPresent      = $isStudentJoining && in_array($currentAtt, ['not_recorded', 'absent'], true);

        $updates = [
            'meeting_link'     => $meetingLink,
            'meeting_info'     => $meetingInfo,
            'meeting_provider' => $meetingProvider,
            'status'           => 'in_progress',
            // COALESCE behaviour: keep the existing started_at if already set.
            'started_at'       => $class->started_at ?? $now,
        ];
        if ($markPresent) {
            $updates['attendance_status']      = 'present';
            $updates['attendance_recorded_at'] = $class->attendance_recorded_at ?? $now;
        }

        $class->update($updates);
        $class->refresh();

        return response()->json([
            'message' => $wasInProgress
                ? 'Class is already in progress. Opening the meeting room.'
                : 'Class is now in progress. Opening the meeting room.',
            'class'   => $this->hydrateClass($class),
            'meeting' => [
                'provider' => $meetingProvider,
                'link'     => $meetingLink,
                'info'     => $meetingInfo,
            ],
        ]);
    }

    /**
     * PATCH /api/classes/{id}/meeting-provider
     * Switch the video platform for a scheduled or in-progress class.
     */
    public function updateMeetingProvider(Request $request): JsonResponse
    {
        $classId = (int) $request->route('id');
        if ($classId < 1) {
            return response()->json(['message' => 'A valid class id is required.'], 400);
        }

        $class = LectiClass::find($classId);
        if (!$class) {
            return response()->json(['message' => 'Class not found.'], 404);
        }

        /** @var User $user */
        $user          = $request->user();
        $isParticipant = (int) $class->student_id === $user->id || (int) $class->teacher_id === $user->id;

        if (!$isParticipant && !$user->isAdmin()) {
            return response()->json([
                'message' => 'Only the assigned student or teacher can change the video platform.',
            ], 403);
        }

        $status = $this->mapper->normalizeClassStatus($class->status);
        if ($status === 'cancelled' || $status === 'completed') {
            return response()->json([
                'message' => 'This class is ' . str_replace('_', ' ', $status) . ' and cannot change platform.',
                'class'   => $this->hydrateClass($class),
            ], 400);
        }

        $raw = strtolower(trim((string) $request->input('meetingProvider', '')));
        if (!in_array($raw, ScheduleMapper::VIDEO_PROVIDERS, true)) {
            return response()->json([
                'message' => 'meetingProvider must be jitsi, google_meet, or zoom.',
            ], 400);
        }

        $provider = $this->mapper->normalizeMeetingProvider($raw);
        $meeting  = $this->mapper->buildMeetingDetails(
            $class->schedule_request_id ?? $classId,
            $class->class_date,
            $this->slotStartTime($class),
            $provider,
        );

        $class->update([
            'meeting_provider' => $meeting['meetingProvider'],
            'meeting_link'     => $meeting['meetingLink'],
            'meeting_info'     => $meeting['meetingInfo'],
        ]);
        $class->refresh();

        $label = match ($meeting['meetingProvider']) {
            'google_meet'   => 'Google Meet',
            'zoom'          => 'Zoom',
            'digital_samba' => 'Digital Samba',
            default         => 'Jitsi Meet',
        };

        return response()->json([
            'message' => "Video platform updated to {$label}.",
            'class'   => $this->hydrateClass($class),
        ]);
    }

    /**
     * PATCH /api/classes/{id}/conduct
     * Update curriculum plan, attendance, participation, or recording URL.
     * Only the assigned teacher (or admin) may call this.
     */
    public function updateLessonConduct(Request $request): JsonResponse
    {
        $classId = (int) $request->route('id');
        if ($classId < 1) {
            return response()->json(['message' => 'A valid class id is required.'], 400);
        }

        $class = LectiClass::find($classId);
        if (!$class) {
            return response()->json(['message' => 'Class not found.'], 404);
        }

        /** @var User $user */
        $user = $request->user();
        if ((int) $class->teacher_id !== $user->id && !$user->isAdmin()) {
            return response()->json([
                'message' => 'Only the assigned teacher can update lesson conduct details.',
            ], 403);
        }

        $status = $this->mapper->normalizeClassStatus($class->status);
        if ($status === 'cancelled') {
            return response()->json([
                'message' => 'Cancelled classes cannot be updated.',
                'class'   => $this->hydrateClass($class),
            ], 400);
        }

        ['updates' => $updates, 'errors' => $errors] = $this->parseConductBody($request->all());

        if (!empty($errors)) {
            return response()->json(['message' => $errors[0], 'errors' => $errors], 400);
        }
        if (empty($updates)) {
            return response()->json([
                'message' => 'Provide at least one of curriculumPlan, attendanceStatus, participationLevel, participationNotes, or recordingUrl.',
            ], 400);
        }

        $class->update($updates);
        $class->refresh();

        return response()->json([
            'message' => 'Lesson conduct details saved.',
            'class'   => $this->hydrateClass($class),
        ]);
    }

    /**
     * POST /api/classes/{id}/complete
     * Mark class as completed, defaulting attendance to present if not recorded.
     */
    public function completeClass(Request $request): JsonResponse
    {
        $classId = (int) $request->route('id');
        if ($classId < 1) {
            return response()->json(['message' => 'A valid class id is required.'], 400);
        }

        $class = LectiClass::find($classId);
        if (!$class) {
            return response()->json(['message' => 'Class not found.'], 404);
        }

        /** @var User $user */
        $user = $request->user();
        if ((int) $class->teacher_id !== $user->id && !$user->isAdmin()) {
            return response()->json([
                'message' => 'Only the assigned teacher can update lesson conduct details.',
            ], 403);
        }

        $status = $this->mapper->normalizeClassStatus($class->status);
        if ($status === 'cancelled') {
            return response()->json([
                'message' => 'Cancelled classes cannot be completed.',
                'class'   => $this->hydrateClass($class),
            ], 400);
        }
        if ($status === 'completed') {
            return response()->json([
                'message' => 'Class is already completed.',
                'class'   => $this->hydrateClass($class),
            ]);
        }

        ['updates' => $updates, 'errors' => $errors] = $this->parseConductBody($request->all());
        if (!empty($errors)) {
            return response()->json(['message' => $errors[0], 'errors' => $errors], 400);
        }

        $now                   = Carbon::now();
        $updates['status']     = 'completed';
        $updates['completed_at'] = $now;

        // Allow completing directly from scheduled (teacher finishes without a separate join).
        if ($status === 'scheduled' && !$class->started_at) {
            $updates['started_at'] = $now;
        }

        // Default attendance to present when completing without an explicit attendance mark.
        $nextAtt = $updates['attendance_status']
            ?? $this->mapper->normalizeAttendanceStatus($class->attendance_status);
        if ($nextAtt === 'not_recorded') {
            $updates['attendance_status']      = 'present';
            $updates['attendance_recorded_at'] = $now;
        }

        $class->update($updates);
        $class->refresh();

        return response()->json([
            'message' => 'Lesson completed. Attendance and participation are saved.',
            'class'   => $this->hydrateClass($class),
        ]);
    }
}
