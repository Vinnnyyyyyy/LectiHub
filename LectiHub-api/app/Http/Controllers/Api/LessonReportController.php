<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LectiClass;
use App\Models\LessonReport;
use App\Models\StudentFeedback;
use App\Models\User;
use App\Services\ClassLifecycleService;
use App\Services\NotificationService;
use App\Services\ScheduleMapper;
use App\Services\SettingsService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LessonReportController extends Controller
{
    public function __construct(
        private readonly ScheduleMapper $mapper,
        private readonly ClassLifecycleService $lifecycle,
        private readonly NotificationService $notifications,
        private readonly SettingsService $settings,
    ) {}

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Map a LessonReport model (with class_title / class_subject resolved via
     * the lectiClass relation) to the camelCase presentation shape.
     */
    private function hydrateReport(LessonReport $report): array
    {
        $report->loadMissing(['teacher', 'student', 'lectiClass']);

        $feedback = StudentFeedback::where('lesson_report_id', $report->id)
            ->select(['id'])
            ->first();

        return $this->mapper->mapLessonReport(
            $report,
            $report->teacher,
            $report->student,
            $report->lectiClass,
            [
                'hasFeedback' => $feedback !== null,
                'feedbackId'  => $feedback?->id,
            ],
        );
    }

    /**
     * Parse and validate the lesson-report submission body.
     * Falls back to class-row values for date, time, topic, and attendance.
     *
     * @param  array<string,mixed>  $body
     * @return array{values: array<string,mixed>, errors: list<string>}
     */
    private function parseReportBody(array $body, LectiClass $class): array
    {
        $errors = [];

        $slotStart   = $class->start_time
            ?? (explode('-', (string) ($class->time_slot ?? ''), 2)[0] ?? '');

        $reportDate  = trim((string) ($body['reportDate']  ?? $class->class_date     ?? ''));
        $reportTime  = trim((string) ($body['reportTime']  ?? $slotStart             ?? ''));
        $lessonTopic = trim((string) ($body['lessonTopic'] ?? $class->curriculum_plan
            ?? $class->subject ?? $class->title ?? ''));
        $pagesDiscussed  = trim((string) ($body['pagesDiscussed']  ?? ''));
        $homeworkAssigned = trim((string) ($body['homeworkAssigned'] ?? ''));
        $remarks         = trim((string) ($body['remarks']         ?? ''));
        $studentProgress = trim((string) ($body['studentProgress'] ?? ''));

        $rawAttendance   = strtolower(trim((string) ($body['attendanceStatus'] ?? $class->attendance_status ?? '')));
        $attendanceStatus = $this->mapper->normalizeAttendanceStatus($rawAttendance);

        if (!$reportDate || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $reportDate)) {
            $errors[] = 'reportDate must be a valid date (YYYY-MM-DD).';
        }
        if (!$reportTime || !preg_match('/^\d{2}:\d{2}/', $reportTime)) {
            $errors[] = 'reportTime must be a valid time (HH:MM).';
        }
        if (!$lessonTopic) {
            $errors[] = 'lessonTopic is required.';
        }
        if (!$rawAttendance
            || !in_array($rawAttendance, ScheduleMapper::ATTENDANCE_STATUSES, true)
            || $attendanceStatus === 'not_recorded'
        ) {
            $errors[] = 'attendanceStatus must be present, late, absent, or excused.';
        }
        if (!$studentProgress) {
            $errors[] = 'studentProgress is required.';
        }

        return [
            'errors' => $errors,
            'values' => [
                'report_date'      => $reportDate,
                'report_time'      => substr($reportTime, 0, 5),
                'lesson_topic'     => $lessonTopic,
                'pages_discussed'  => $pagesDiscussed,
                'attendance_status' => $attendanceStatus,
                'homework_assigned' => $homeworkAssigned,
                'remarks'          => $remarks,
                'student_progress' => $studentProgress,
            ],
        ];
    }

    /**
     * Check whether the authenticated user may read a lesson report row.
     */
    private function canAccessReport(User $user, LessonReport $report): bool
    {
        if ($user->isAdmin()) {
            return true;
        }
        if ($user->isTeacher() && (int) $report->teacher_id === $user->id) {
            return true;
        }
        if ($user->isStudent() && (int) $report->student_id === $user->id) {
            return true;
        }
        return false;
    }

    /**
     * Send lesson-report-submitted notifications to the student and all admins.
     */
    private function notifyReportSubmitted(LessonReport $report, string $teacherName): void
    {
        $topic   = $report->lesson_topic;
        $details = [
            'reportId'         => $report->id,
            'classId'          => $report->class_id,
            'lessonTopic'      => $topic,
            'reportDate'       => $report->report_date,
            'reportTime'       => $report->report_time,
            'attendanceStatus' => $report->attendance_status,
        ];

        $askFeedback = (bool) $this->settings->get('reminders.request_feedback_after_report', true);

        if ($report->student_id) {
            if ($askFeedback) {
                $this->notifications->createNotification(
                    userId:         (int) $report->student_id,
                    type:           'lesson_report',
                    title:          'Lesson report ready — please share feedback',
                    message:        "{$teacherName} submitted a lesson report for {$topic}. Please complete the feedback form for this lesson.",
                    relatedClassId: (int) $report->class_id,
                    details:        array_merge($details, ['promptFeedback' => true]),
                );
            } else {
                $this->notifications->createNotification(
                    userId:         (int) $report->student_id,
                    type:           'lesson_report',
                    title:          'Lesson report ready',
                    message:        "{$teacherName} submitted a lesson report for {$topic}.",
                    relatedClassId: (int) $report->class_id,
                    details:        array_merge($details, ['promptFeedback' => false]),
                );
            }
        }

        $adminIds = User::where('role', 'admin')->pluck('id')->all();
        $this->notifications->notifyMany(
            userIds:        $adminIds,
            type:           'lesson_report',
            title:          'Lesson report submitted',
            message:        "{$teacherName} submitted a lesson report for {$topic}.",
            relatedClassId: (int) $report->class_id,
            details:        $details,
        );

        if (
            ($report->attendance_status ?? '') === 'absent'
            && (bool) $this->settings->get('reminders.alert_admin_on_absence', true)
        ) {
            $this->notifications->notifyMany(
                userIds:        $adminIds,
                type:           'attendance_alert',
                title:          'Student marked absent',
                message:        "{$teacherName} marked a student absent for {$topic}.",
                relatedClassId: (int) $report->class_id,
                details:        $details,
            );
        }
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    /**
     * GET /api/lesson-reports
     * List lesson reports accessible to the authenticated user.
     */
    public function listLessonReports(Request $request): JsonResponse
    {
        /** @var User $user */
        $user  = $request->user();
        $query = LessonReport::query()
            ->orderByDesc('submitted_at')
            ->orderByDesc('id');

        if ($user->isAdmin()) {
            // all reports
        } elseif ($user->isTeacher()) {
            $query->where('teacher_id', $user->id);
        } elseif ($user->isStudent()) {
            $query->where('student_id', $user->id);
        } else {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $reports = $query->get()
            ->map(fn (LessonReport $r) => $this->hydrateReport($r))
            ->values()
            ->all();

        return response()->json($reports);
    }

    /**
     * GET /api/classes/{id}/lesson-report
     * Fetch the lesson report for a specific class.
     */
    public function getLessonReportForClass(Request $request): JsonResponse
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
        $isParticipant = (int) $class->teacher_id === $user->id || (int) $class->student_id === $user->id;
        if (!$isParticipant && !$user->isAdmin()) {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $report = LessonReport::where('class_id', $classId)->first();
        if (!$report) {
            return response()->json(['message' => 'No lesson report submitted for this class yet.'], 404);
        }

        return response()->json($this->hydrateReport($report));
    }

    /**
     * GET /api/lesson-reports/{reportId}
     * Fetch a lesson report by its own ID.
     */
    public function getLessonReportById(Request $request): JsonResponse
    {
        $reportId = (int) $request->route('reportId');
        if ($reportId < 1) {
            return response()->json(['message' => 'A valid report id is required.'], 400);
        }

        $report = LessonReport::find($reportId);
        if (!$report) {
            return response()->json(['message' => 'Lesson report not found.'], 404);
        }

        /** @var User $user */
        $user = $request->user();
        if (!$this->canAccessReport($user, $report)) {
            return response()->json(['message' => 'Access denied'], 403);
        }

        return response()->json($this->hydrateReport($report));
    }

    /**
     * POST /api/classes/{id}/lesson-report
     * Create (or update) the lesson report for a class.
     * Only the assigned teacher (or admin) may submit.
     */
    public function submitLessonReport(Request $request): JsonResponse
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
                'message' => 'Only the assigned teacher can submit a lesson report.',
            ], 403);
        }

        $status = $this->mapper->normalizeClassStatus($class->status);
        if ($status !== 'completed' && $status !== 'in_progress') {
            return response()->json([
                'message' => 'Lesson reports can be submitted after the class is in progress or completed.',
            ], 400);
        }

        if (!$class->student_id) {
            return response()->json([
                'message' => 'This class has no assigned student, so a report cannot be submitted.',
            ], 400);
        }

        ['values' => $values, 'errors' => $errors] = $this->parseReportBody($request->all(), $class);
        if (!empty($errors)) {
            return response()->json(['message' => $errors[0], 'errors' => $errors], 400);
        }

        $teacher     = $class->teacher;
        $teacherName = $teacher?->full_name ?: ($teacher?->username ?? 'Teacher');
        $existing    = LessonReport::where('class_id', $classId)->first();

        if ($existing) {
            $existing->update(array_merge($values, ['updated_at' => Carbon::now()]));
            $reportId = $existing->id;
        } else {
            $report = LessonReport::create(array_merge($values, [
                'class_id'     => $classId,
                'teacher_id'   => $class->teacher_id,
                'student_id'   => $class->student_id,
                'submitted_at' => Carbon::now(),
            ]));
            $reportId = $report->id;
        }

        // Keep the class attendance_status in sync with the formal report.
        // Use COALESCE semantics: stamp attendance_recorded_at only if not already set.
        $class->attendance_status = $values['attendance_status'];
        if (!$class->attendance_recorded_at) {
            $class->attendance_recorded_at = Carbon::now();
        }
        $class->save();

        // Finalize (complete + archive) the class if both report and feedback exist.
        $finalization = $this->lifecycle->finalizeClassIfReady($classId);

        $saved = LessonReport::find($reportId);

        // Notify student and admins only on first submit (not updates).
        if (!$existing) {
            $this->notifyReportSubmitted($saved, $teacherName);
        }

        $message = $existing
            ? 'Lesson report updated successfully.'
            : 'Lesson report submitted. It is now available to the administrator and student.';

        if ($finalization['newlyArchived'] ?? false) {
            $message = 'Lesson report submitted. Class is now Completed and archived into learning and teaching history.';
        } elseif (!($finalization['hasStudentFeedback'] ?? false) && !$existing) {
            $message .= ' Waiting for student feedback to fully complete and archive the class.';
        }

        return response()->json([
            'message'           => $message,
            'report'            => $this->hydrateReport($saved),
            'classFinalization' => [
                'ready'             => $finalization['ready'],
                'finalized'         => $finalization['finalized'],
                'newlyArchived'     => (bool) ($finalization['newlyArchived'] ?? false),
                'hasStudentFeedback'=> $finalization['hasStudentFeedback'],
            ],
        ], $existing ? 200 : 201);
    }
}
