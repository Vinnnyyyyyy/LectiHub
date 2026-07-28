<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LectiClass;
use App\Models\LessonReport;
use App\Models\ScheduleRequest;
use App\Models\StudentFeedback;
use App\Models\User;
use App\Services\ScheduleMapper;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminMonitoringController extends Controller
{
    public function __construct(
        private readonly ScheduleMapper $mapper,
    ) {}

    // -------------------------------------------------------------------------
    // Stat builders (mirror Express buildXxx functions)
    // -------------------------------------------------------------------------

    /**
     * Schedule-request counts and average approval latency.
     */
    private function buildSchedulingStats(): array
    {
        $pending  = ScheduleRequest::where('status', 'pending')->count();
        $approved = ScheduleRequest::where('status', 'approved')->count();
        $rejected = ScheduleRequest::where('status', 'rejected')->count();
        $total    = $pending + $approved + $rejected;

        $latencyRows = ScheduleRequest::where('status', 'approved')
            ->whereNotNull('assigned_at')
            ->whereNotNull('created_at')
            ->select(['created_at', 'assigned_at'])
            ->get();

        $latencyHours = [];
        foreach ($latencyRows as $row) {
            $created  = Carbon::parse($row->created_at);
            $assigned = Carbon::parse($row->assigned_at);
            $hours    = ($assigned->getTimestamp() - $created->getTimestamp()) / 3600.0;
            if ($hours >= 0) {
                $latencyHours[] = $hours;
            }
        }

        return [
            'totalRequests'        => $total,
            'pending'              => $pending,
            'approved'             => $approved,
            'rejected'             => $rejected,
            'approvalRate'         => $total ? (int) round(($approved / $total) * 100) : 0,
            'averageApprovalHours' => $this->average($latencyHours),
        ];
    }

    /**
     * Attendance breakdown across all class records.
     */
    private function buildAttendanceStats(): array
    {
        $statuses = LectiClass::whereNotNull('attendance_status')
            ->where('attendance_status', '!=', '')
            ->pluck('attendance_status');

        $counts = [
            'present'      => 0,
            'late'         => 0,
            'absent'       => 0,
            'excused'      => 0,
            'not_recorded' => 0,
        ];

        foreach ($statuses as $raw) {
            $status          = $this->mapper->normalizeAttendanceStatus($raw);
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        }

        $recorded = $counts['present'] + $counts['late'] + $counts['absent'] + $counts['excused'];
        $total    = $recorded + $counts['not_recorded'];

        return [
            'totalClasses'   => $total,
            'recorded'       => $recorded,
            'notRecorded'    => $counts['not_recorded'],
            'present'        => $counts['present'],
            'late'           => $counts['late'],
            'absent'         => $counts['absent'],
            'excused'        => $counts['excused'],
            'recordedRate'   => $total    ? (int) round(($recorded           / $total)    * 100) : 0,
            'presentRate'    => $recorded ? (int) round(($counts['present']  / $recorded) * 100) : 0,
        ];
    }

    /**
     * Class status breakdown with completion rate.
     */
    private function buildClassStats(): array
    {
        $statuses = LectiClass::pluck('status');

        $counts = [
            'scheduled'   => 0,
            'in_progress' => 0,
            'completed'   => 0,
            'cancelled'   => 0,
        ];

        foreach ($statuses as $raw) {
            $status          = $this->mapper->normalizeClassStatus($raw);
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        }

        $total = array_sum($counts);

        return [
            'total'          => $total,
            'scheduled'      => $counts['scheduled'],
            'inProgress'     => $counts['in_progress'],
            'completed'      => $counts['completed'],
            'cancelled'      => $counts['cancelled'],
            'completionRate' => $total ? (int) round(($counts['completed'] / $total) * 100) : 0,
        ];
    }

    /**
     * Per-teacher performance metrics (completed classes, reports, ratings, attendance).
     *
     * @return list<array<string,mixed>>
     */
    private function buildTeacherPerformance(): array
    {
        $teachers = User::where('role', 'teacher')
            ->orderByRaw('COALESCE(full_name, username) COLLATE NOCASE')
            ->select(['id', 'username', 'full_name', 'email', 'subject_expertise'])
            ->get();

        return $teachers->map(function (User $teacher) {
            $completedClasses = LectiClass::where('teacher_id', $teacher->id)
                ->where('status', 'completed')
                ->count();

            $reportsSubmitted = LessonReport::where('teacher_id', $teacher->id)->count();

            $ratings = StudentFeedback::where('teacher_id', $teacher->id)
                ->pluck('overall_rating')
                ->filter(fn ($v) => is_numeric($v))
                ->map(fn ($v) => (int) $v)
                ->values()
                ->all();

            $attendanceRecorded = LectiClass::where('teacher_id', $teacher->id)
                ->whereNotNull('attendance_status')
                ->where('attendance_status', '!=', '')
                ->whereRaw("LOWER(TRIM(attendance_status)) != 'not_recorded'")
                ->count();

            return [
                'id'                 => $teacher->id,
                'username'           => $teacher->username,
                'fullName'           => $teacher->full_name ?: $teacher->username,
                'email'              => $teacher->email ?? '',
                'subjectExpertise'   => $teacher->subject_expertise ?? '',
                'completedClasses'   => $completedClasses,
                'reportsSubmitted'   => $reportsSubmitted,
                'feedbackCount'      => count($ratings),
                'averageRating'      => $this->average($ratings),
                'attendanceRecorded' => $attendanceRecorded,
            ];
        })->values()->all();
    }

    /**
     * Most recent completed classes (default limit 8).
     *
     * @return list<array<string,mixed>>
     */
    private function recentCompletedClasses(int $limit = 8): array
    {
        return LectiClass::where('status', 'completed')
            ->orderByRaw('COALESCE(completed_at, class_date) DESC')
            ->orderByDesc('id')
            ->limit($limit)
            ->with(['teacher', 'student'])
            ->get()
            ->map(fn (LectiClass $c) => $this->mapper->mapClassRow($c, $c->teacher, $c->student))
            ->values()
            ->all();
    }

    /**
     * Most recent lesson reports (default limit 8).
     *
     * @return list<array<string,mixed>>
     */
    private function recentLessonReports(int $limit = 8): array
    {
        return LessonReport::query()
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->with(['teacher', 'student', 'lectiClass', 'feedback'])
            ->get()
            ->map(function (LessonReport $report) {
                return $this->mapper->mapLessonReport(
                    $report,
                    $report->teacher,
                    $report->student,
                    $report->lectiClass,
                    [
                        'hasFeedback' => $report->feedback !== null,
                        'feedbackId'  => $report->feedback?->id,
                    ],
                );
            })
            ->values()
            ->all();
    }

    /**
     * Most recent student feedback submissions (default limit 8).
     *
     * @return list<array<string,mixed>>
     */
    private function recentStudentFeedback(int $limit = 8): array
    {
        return StudentFeedback::query()
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->with(['teacher', 'student', 'lessonReport', 'lectiClass'])
            ->get()
            ->map(function (StudentFeedback $feedback) {
                $report = $feedback->lessonReport;
                $class  = $feedback->lectiClass;

                // mapStudentFeedback reads class_title / class_subject from the row.
                $row = array_merge($feedback->toArray(), [
                    'class_title'   => $class?->title,
                    'class_subject' => $class?->subject,
                ]);

                return $this->mapper->mapStudentFeedback(
                    $row,
                    $feedback->teacher,
                    $feedback->student,
                    $report ? [
                        'lesson_topic' => $report->lesson_topic,
                        'report_date'  => $report->report_date,
                    ] : null,
                );
            })
            ->values()
            ->all();
    }

    /**
     * Recent classes with a recorded attendance status (default limit 12).
     *
     * @return list<array<string,mixed>>
     */
    private function buildAttendanceRecords(int $limit = 12): array
    {
        return LectiClass::whereNotNull('attendance_status')
            ->where('attendance_status', '!=', '')
            ->whereRaw("LOWER(TRIM(attendance_status)) != 'not_recorded'")
            ->orderByRaw('COALESCE(attendance_recorded_at, completed_at, class_date) DESC')
            ->orderByDesc('id')
            ->limit($limit)
            ->with(['teacher', 'student'])
            ->get()
            ->map(function (LectiClass $class) {
                $mapped           = $this->mapper->mapClassRow($class, $class->teacher, $class->student);
                $attendanceStatus = $mapped['attendanceStatus'];
                return [
                    'id'                    => $mapped['id'],
                    'classDate'             => $mapped['classDate'],
                    'title'                 => $mapped['title'],
                    'subject'               => $mapped['subject'],
                    'attendanceStatus'      => $attendanceStatus,
                    'attendanceStatusLabel' => $mapped['attendanceStatusLabel']
                        ?: $this->mapper->labelFromSnake($attendanceStatus),
                    'teacher'               => $mapped['teacher'],
                    'student'               => $mapped['student'],
                    'status'                => $mapped['status'],
                ];
            })
            ->values()
            ->all();
    }

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    /**
     * Return the mean of a float array rounded to 1 decimal, or null if empty.
     *
     * @param  list<float|int>  $values
     */
    private function average(array $values): ?float
    {
        if (empty($values)) {
            return null;
        }
        return round(array_sum($values) / count($values), 1);
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    /**
     * GET /api/admin/monitoring
     * Return the full monitoring overview matching the Vue AdminMonitoringOverview shape.
     */
    public function getMonitoringOverview(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        if (!$user->isAdmin()) {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $classStats        = $this->buildClassStats();
        $scheduling        = $this->buildSchedulingStats();
        $attendance        = $this->buildAttendanceStats();
        $teacherPerformance = $this->buildTeacherPerformance();

        $reportCount    = LessonReport::count();
        $feedbackCount  = StudentFeedback::count();
        $feedbackRatings = StudentFeedback::pluck('overall_rating')
            ->filter(fn ($v) => is_numeric($v))
            ->map(fn ($v) => (int) $v)
            ->values()
            ->all();

        $studentsWithProgress = LessonReport::whereNotNull('student_progress')
            ->where('student_progress', '!=', '')
            ->count();

        $summary = [
            'completedClasses'          => $classStats['completed'],
            'inProgressClasses'         => $classStats['inProgress'],
            'scheduledClasses'          => $classStats['scheduled'],
            'lessonReports'             => $reportCount,
            'studentFeedback'           => $feedbackCount,
            'averageFeedbackRating'     => $this->average($feedbackRatings),
            'attendanceRecorded'        => $attendance['recorded'],
            'attendancePresentRate'     => $attendance['presentRate'],
            'pendingScheduleRequests'   => $scheduling['pending'],
            'approvedScheduleRequests'  => $scheduling['approved'],
            'studentsWithProgressNotes' => $studentsWithProgress,
            'activeTeachers'            => count($teacherPerformance),
        ];

        return response()->json([
            'generatedAt'           => Carbon::now()->toISOString(),
            'summary'               => $summary,
            'classStats'            => $classStats,
            'scheduling'            => $scheduling,
            'attendance'            => $attendance,
            'teacherPerformance'    => $teacherPerformance,
            'recentCompletedClasses'=> $this->recentCompletedClasses(),
            'recentLessonReports'   => $this->recentLessonReports(),
            'recentStudentFeedback' => $this->recentStudentFeedback(),
            'attendanceRecords'     => $this->buildAttendanceRecords(),
        ]);
    }
}
