<?php

namespace App\Services;

use Carbon\Carbon;

/**
 * Pure-function helpers that map DB rows / request data to camelCase arrays
 * and build meeting details.  Mirrors scheduleHelpers.js.
 */
class ScheduleMapper
{
    public const VIDEO_PROVIDERS = ['jitsi', 'google_meet', 'zoom', 'digital_samba'];

    public const ATTENDANCE_STATUSES = [
        'not_recorded', 'present', 'late', 'absent', 'excused',
    ];

    public const PARTICIPATION_LEVELS = [
        'not_recorded', 'low', 'medium', 'high',
    ];

    // -----------------------------------------------------------------------
    // Time-slot helpers
    // -----------------------------------------------------------------------

    /**
     * Parse "HH:MM-HH:MM" into startTime, endTime, durationMinutes.
     *
     * @return array{startTime: ?string, endTime: ?string, durationMinutes: int}
     */
    public function parseTimeSlot(?string $timeSlot): array
    {
        if (!$timeSlot) {
            return ['startTime' => null, 'endTime' => null, 'durationMinutes' => 60];
        }

        [$startTime, $endTime] = array_pad(explode('-', (string) $timeSlot, 2), 2, null);

        if (!$startTime || !$endTime) {
            return ['startTime' => null, 'endTime' => null, 'durationMinutes' => 60];
        }

        $toMinutes = function (string $value): ?int {
            $parts = explode(':', $value);
            if (count($parts) < 2) {
                return null;
            }
            [$h, $m] = [(int) $parts[0], (int) $parts[1]];
            if (!is_numeric($parts[0]) || !is_numeric($parts[1])) {
                return null;
            }
            return $h * 60 + $m;
        };

        $start    = $toMinutes($startTime);
        $end      = $toMinutes($endTime);
        $duration = ($start !== null && $end !== null && $end > $start)
            ? $end - $start
            : 60;

        return [
            'startTime'       => $startTime,
            'endTime'         => $endTime,
            'durationMinutes' => $duration,
        ];
    }

    // -----------------------------------------------------------------------
    // Status normalisers
    // -----------------------------------------------------------------------

    public function normalizeClassStatus(?string $status): string
    {
        $value = strtolower((string) ($status ?? 'scheduled'));
        if ($value === 'confirmed') {
            return 'scheduled';
        }
        if (in_array($value, ['scheduled', 'in_progress', 'completed', 'cancelled'], true)) {
            return $value;
        }
        return 'scheduled';
    }

    public function normalizeAttendanceStatus(?string $value): string
    {
        $status = strtolower(trim((string) ($value ?? 'not_recorded')));
        return in_array($status, self::ATTENDANCE_STATUSES, true) ? $status : 'not_recorded';
    }

    public function normalizeParticipationLevel(?string $value): string
    {
        $level = strtolower(trim((string) ($value ?? 'not_recorded')));
        return in_array($level, self::PARTICIPATION_LEVELS, true) ? $level : 'not_recorded';
    }

    /**
     * Turn "snake_case" into "Snake Case".
     */
    public function labelFromSnake(?string $value): string
    {
        return implode(
            ' ',
            array_map(
                fn (string $p) => ucfirst($p),
                array_filter(explode('_', (string) ($value ?? '')))
            )
        );
    }

    // -----------------------------------------------------------------------
    // Meeting-provider helpers
    // -----------------------------------------------------------------------

    public function getMeetingProvider(): string
    {
        $provider = strtolower((string) env('MEETING_PROVIDER', 'jitsi'));
        return in_array($provider, self::VIDEO_PROVIDERS, true) ? $provider : 'jitsi';
    }

    public function normalizeMeetingProvider(?string $value): string
    {
        $provider = strtolower(trim((string) ($value ?? '')));
        return in_array($provider, self::VIDEO_PROVIDERS, true) ? $provider : $this->getMeetingProvider();
    }

    /**
     * Build provider-specific meeting details for a class.
     *
     * @return array{meetingProvider: string, meetingInfo: string, meetingLink: string}
     */
    public function buildMeetingDetails(
        int|string $requestId,
        string $classDate,
        string $startTime,
        ?string $preferredProvider = null
    ): array {
        $roomCode = sprintf(
            'LH-%s-%s-%s',
            $requestId,
            str_replace('-', '', $classDate),
            str_replace(':', '', $startTime)
        );

        $provider = $preferredProvider
            ? $this->normalizeMeetingProvider($preferredProvider)
            : $this->getMeetingProvider();

        if ($provider === 'google_meet') {
            $base = rtrim((string) env('GOOGLE_MEET_BASE_URL', 'https://meet.google.com'), '/');
            $link = $base . '/' . strtolower($roomCode);
            return [
                'meetingProvider' => 'google_meet',
                'meetingInfo'     => "Google Meet · Room {$roomCode}",
                'meetingLink'     => $link,
            ];
        }

        if ($provider === 'zoom') {
            $template = (string) env('ZOOM_MEETING_LINK_TEMPLATE', 'https://zoom.us/j/{room}');
            $safe     = preg_replace('/[^a-zA-Z0-9]/', '', $roomCode);
            $link     = str_replace('{room}', $safe, $template);
            return [
                'meetingProvider' => 'zoom',
                'meetingInfo'     => "Zoom · Meeting {$roomCode}",
                'meetingLink'     => $link,
            ];
        }

        if ($provider === 'digital_samba') {
            $base = rtrim((string) env('DIGITAL_SAMBA_BASE_URL', 'https://room.digitalsamba.com'), '/');
            $link = $base . '/' . strtolower($roomCode);
            return [
                'meetingProvider' => 'digital_samba',
                'meetingInfo'     => "Digital Samba · Room {$roomCode}",
                'meetingLink'     => $link,
            ];
        }

        // Default: Jitsi
        $jitsiBase = rtrim((string) env('JITSI_BASE_URL', 'https://meet.jit.si'), '/');
        $link      = "{$jitsiBase}/LectiHub-{$roomCode}";
        return [
            'meetingProvider' => 'jitsi',
            'meetingInfo'     => "Jitsi Meet · Room LectiHub-{$roomCode}",
            'meetingLink'     => $link,
        ];
    }

    // -----------------------------------------------------------------------
    // Join-window logic
    // -----------------------------------------------------------------------

    /**
     * Resolve the start/end time strings for a class row (plain array or model).
     *
     * @param  array|object  $classRow
     * @return array{startTime: string, endTime: string}
     */
    private function classWindow(array|object $classRow): array
    {
        $get = fn ($key) => is_array($classRow) ? ($classRow[$key] ?? null) : ($classRow->{$key} ?? null);

        $timeSlot  = (string) ($get('time_slot') ?? '');
        $slotParts = explode('-', $timeSlot, 2);

        $startTime = $get('start_time') ?? ($slotParts[0] ?? '09:00');
        $endTime   = $get('end_time')   ?? ($slotParts[1] ?? '10:00');

        return ['startTime' => (string) $startTime, 'endTime' => (string) $endTime];
    }

    /**
     * Determine whether a class is joinable right now (or at a given $now).
     *
     * @param  array|object  $classRow
     */
    public function getJoinAvailability(array|object $classRow, ?Carbon $now = null): array
    {
        $now    = $now ?? Carbon::now();
        $status = $this->normalizeClassStatus(
            is_array($classRow) ? ($classRow['status'] ?? null) : ($classRow->status ?? null)
        );

        if ($status === 'completed' || $status === 'cancelled') {
            return [
                'canJoin'      => false,
                'reason'       => 'Class is ' . str_replace('_', ' ', $status),
                'withinWindow' => false,
            ];
        }

        $get  = fn ($key) => is_array($classRow) ? ($classRow[$key] ?? null) : ($classRow->{$key} ?? null);
        $date = (string) ($get('class_date') ?? '');
        ['startTime' => $startTime, 'endTime' => $endTime] = $this->classWindow($classRow);

        try {
            $classStart = Carbon::createFromFormat('Y-m-d H:i', "{$date} {$startTime}");
            $classEnd   = Carbon::createFromFormat('Y-m-d H:i', "{$date} {$endTime}");
        } catch (\Throwable) {
            return ['canJoin' => false, 'reason' => 'Invalid class schedule', 'withinWindow' => false];
        }

        $beforeMinutes = (int) env('MEETING_JOIN_MINUTES_BEFORE', 15);
        $afterMinutes  = (int) env('MEETING_JOIN_MINUTES_AFTER', 15);

        $windowStart  = $classStart->copy()->subMinutes($beforeMinutes);
        $windowEnd    = $classEnd->copy()->addMinutes($afterMinutes);
        $withinWindow = $now->between($windowStart, $windowEnd);

        $allowEarly = strtolower((string) env('MEETING_ALLOW_EARLY_JOIN', 'true')) === 'true';

        if ($withinWindow || ($allowEarly && $status === 'scheduled') || $status === 'in_progress') {
            return [
                'canJoin'      => true,
                'reason'       => $withinWindow ? 'Join window open' : 'Early join enabled',
                'withinWindow' => $withinWindow,
                'windowStart'  => $windowStart->toISOString(),
                'windowEnd'    => $windowEnd->toISOString(),
            ];
        }

        return [
            'canJoin'      => false,
            'reason'       => "Join opens {$beforeMinutes} minutes before class start",
            'withinWindow' => false,
            'windowStart'  => $windowStart->toISOString(),
            'windowEnd'    => $windowEnd->toISOString(),
        ];
    }

    // -----------------------------------------------------------------------
    // Row mappers
    // -----------------------------------------------------------------------

    /**
     * Map a LectiClass DB row (Eloquent model or plain array) to a camelCase
     * presentation array.
     *
     * @param  array|object  $row
     * @param  array|object|null  $teacher
     * @param  array|object|null  $student
     */
    public function mapClassRow(
        array|object $row,
        array|object|null $teacher = null,
        array|object|null $student = null
    ): array {
        $get = fn ($key) => is_array($row) ? ($row[$key] ?? null) : ($row->{$key} ?? null);

        $status   = $this->normalizeClassStatus($get('status'));
        $join     = $this->getJoinAvailability($row);
        $timeSlot = (string) ($get('time_slot') ?? '');
        $parts    = explode('-', $timeSlot, 2);

        $attendanceStatus    = $this->normalizeAttendanceStatus($get('attendance_status'));
        $participationLevel  = $this->normalizeParticipationLevel($get('participation_level'));
        $recordingUrl        = trim((string) ($get('recording_url') ?? ''));

        $statusLabel = match ($status) {
            'in_progress' => 'In Progress',
            'scheduled'   => 'Scheduled',
            default       => ucfirst($status),
        };

        return [
            'id'                      => $get('id'),
            'teacherId'               => $get('teacher_id'),
            'studentId'               => $get('student_id'),
            'scheduleRequestId'       => $get('schedule_request_id'),
            'classDate'               => $get('class_date'),
            'timeSlot'                => $timeSlot,
            'startTime'               => $get('start_time') ?? ($parts[0] ?? null),
            'endTime'                 => $get('end_time')   ?? ($parts[1] ?? null),
            'durationMinutes'         => $get('duration_minutes') ?? 60,
            'title'                   => $get('title') ?? 'Confirmed lesson',
            'subject'                 => $get('subject') ?? '',
            'meetingInfo'             => $get('meeting_info') ?? '',
            'meetingLink'             => $get('meeting_link') ?? '',
            'meetingProvider'         => $get('meeting_provider') ?? $this->getMeetingProvider(),
            'status'                  => $status,
            'statusLabel'             => $statusLabel,
            'canJoin'                 => $join['canJoin'],
            'joinReason'              => $join['reason'],
            'withinJoinWindow'        => $join['withinWindow'],
            'startedAt'               => $get('started_at'),
            'curriculumPlan'          => $get('curriculum_plan') ?? '',
            'attendanceStatus'        => $attendanceStatus,
            'attendanceStatusLabel'   => $this->labelFromSnake($attendanceStatus),
            'attendanceRecordedAt'    => $get('attendance_recorded_at'),
            'participationLevel'      => $participationLevel,
            'participationLevelLabel' => $this->labelFromSnake($participationLevel),
            'participationNotes'      => $get('participation_notes') ?? '',
            'recordingUrl'            => $recordingUrl,
            'hasRecording'            => $recordingUrl !== '',
            'completedAt'             => $get('completed_at'),
            'archivedAt'              => $get('archived_at'),
            'isArchived'              => $get('archived_at') !== null,
            'createdAt'               => $get('created_at'),
            'teacher'                 => $teacher ? $this->mapUserBrief($teacher, true) : null,
            'student'                 => $student ? $this->mapUserBrief($student, false) : null,
        ];
    }

    /**
     * Map a LessonReport row to a camelCase presentation array.
     *
     * @param  array|object  $row
     * @param  array|object|null  $teacher
     * @param  array|object|null  $student
     * @param  array|object|null  $classRow
     * @param  array{hasFeedback?: bool, feedbackId?: int|null}|null  $feedbackMeta
     */
    public function mapLessonReport(
        array|object $row,
        array|object|null $teacher = null,
        array|object|null $student = null,
        array|object|null $classRow = null,
        ?array $feedbackMeta = null
    ): array {
        $get  = fn ($key) => is_array($row)      ? ($row[$key]      ?? null) : ($row->{$key}      ?? null);
        $cGet = fn ($key) => $classRow === null   ? null
            : (is_array($classRow) ? ($classRow[$key] ?? null) : ($classRow->{$key} ?? null));

        $attendanceStatus = $this->normalizeAttendanceStatus($get('attendance_status'));

        $hasFeedback = isset($feedbackMeta['hasFeedback'])
            ? (bool) $feedbackMeta['hasFeedback']
            : (bool) ($get('feedback_id') ?? $get('has_feedback'));

        $feedbackId = $feedbackMeta['feedbackId'] ?? $get('feedback_id') ?? null;

        return [
            'id'                    => $get('id'),
            'classId'               => $get('class_id'),
            'teacherId'             => $get('teacher_id'),
            'studentId'             => $get('student_id'),
            'reportDate'            => $get('report_date'),
            'reportTime'            => $get('report_time'),
            'lessonTopic'           => $get('lesson_topic') ?? '',
            'pagesDiscussed'        => $get('pages_discussed') ?? '',
            'attendanceStatus'      => $attendanceStatus,
            'attendanceStatusLabel' => $this->labelFromSnake($attendanceStatus),
            'homeworkAssigned'      => $get('homework_assigned') ?? '',
            'remarks'               => $get('remarks') ?? '',
            'studentProgress'       => $get('student_progress') ?? '',
            'submittedAt'           => $get('submitted_at'),
            'updatedAt'             => $get('updated_at'),
            'classTitle'            => $cGet('title') ?? $get('class_title'),
            'classSubject'          => $cGet('subject') ?? $get('class_subject'),
            'hasFeedback'           => $hasFeedback,
            'feedbackId'            => $feedbackId,
            'needsFeedback'         => !$hasFeedback,
            'teacher'               => $teacher ? $this->mapUserBrief($teacher, true) : null,
            'student'               => $student ? $this->mapUserBrief($student, false) : null,
        ];
    }

    /**
     * Map a StudentFeedback row to a camelCase presentation array.
     *
     * @param  array|object  $row
     * @param  array|object|null  $teacher
     * @param  array|object|null  $student
     * @param  array|object|null  $report
     */
    public function mapStudentFeedback(
        array|object $row,
        array|object|null $teacher = null,
        array|object|null $student = null,
        array|object|null $report = null
    ): array {
        $get  = fn ($key) => is_array($row)    ? ($row[$key]    ?? null) : ($row->{$key}    ?? null);
        $rGet = fn ($key) => $report === null  ? null
            : (is_array($report) ? ($report[$key] ?? null) : ($report->{$key} ?? null));

        $rating = (int) $get('overall_rating');

        return [
            'id'                => $get('id'),
            'lessonReportId'    => $get('lesson_report_id'),
            'classId'           => $get('class_id'),
            'studentId'         => $get('student_id'),
            'teacherId'         => $get('teacher_id'),
            'overallRating'     => is_numeric($get('overall_rating')) ? $rating : null,
            'comments'          => $get('comments') ?? '',
            'suggestions'       => $get('suggestions') ?? '',
            'learningExperience'=> $get('learning_experience') ?? '',
            'submittedAt'       => $get('submitted_at'),
            'lessonTopic'       => $rGet('lesson_topic') ?? $get('lesson_topic'),
            'reportDate'        => $rGet('report_date')  ?? $get('report_date'),
            'classTitle'        => $get('class_title'),
            'classSubject'      => $get('class_subject'),
            'teacher'           => $teacher ? $this->mapUserBrief($teacher, true) : null,
            'student'           => $student ? $this->mapUserBrief($student, false) : null,
        ];
    }

    // -----------------------------------------------------------------------
    // Request mapper (camelCase inbound → snake_case for DB insert)
    // -----------------------------------------------------------------------

    /**
     * Normalise an API request payload for creating/updating a schedule request.
     *
     * @param  array<string,mixed>  $input
     * @return array<string,mixed>
     */
    public function mapRequest(array $input): array
    {
        return [
            'student_id'                => $input['studentId']              ?? $input['student_id']               ?? null,
            'remarks'                   => $input['remarks']                ?? null,
            'program'                   => $input['program']                ?? null,
            'entity_type'               => $input['entityType']             ?? $input['entity_type']               ?? null,
            'preferred_meeting_provider'=> $this->normalizeMeetingProvider(
                $input['preferredMeetingProvider'] ?? $input['preferred_meeting_provider'] ?? null
            ),
            'source'                    => $input['source']                 ?? 'manual',
        ];
    }

    // -----------------------------------------------------------------------
    // URL validator
    // -----------------------------------------------------------------------

    public function isValidHttpUrl(?string $value): bool
    {
        if (!$value) {
            return true;
        }
        return (bool) filter_var($value, FILTER_VALIDATE_URL)
            && in_array(parse_url($value, PHP_URL_SCHEME), ['http', 'https'], true);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * @param  array|object  $user
     */
    private function mapUserBrief(array|object $user, bool $isTeacher): array
    {
        $get = fn ($key) => is_array($user) ? ($user[$key] ?? null) : ($user->{$key} ?? null);

        $base = [
            'id'       => $get('id'),
            'username' => $get('username'),
            'fullName' => $get('full_name') ?? $get('username'),
            'email'    => $get('email') ?? '',
        ];

        if ($isTeacher) {
            $base['subjectExpertise'] = $get('subject_expertise') ?? '';
        }

        return $base;
    }
}
