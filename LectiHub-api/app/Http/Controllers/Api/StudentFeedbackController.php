<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LessonReport;
use App\Models\StudentFeedback;
use App\Models\User;
use App\Services\ClassLifecycleService;
use App\Services\NotificationService;
use App\Services\ScheduleMapper;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentFeedbackController extends Controller
{
    public function __construct(
        private readonly ScheduleMapper $mapper,
        private readonly ClassLifecycleService $lifecycle,
        private readonly NotificationService $notifications,
    ) {}

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Map a StudentFeedback model to the camelCase presentation shape.
     * Resolves lesson_topic / report_date from the related LessonReport, and
     * merges class_title / class_subject (which mapStudentFeedback reads from
     * the row itself) from the related LectiClass.
     */
    private function hydrateFeedback(StudentFeedback $feedback): array
    {
        $feedback->loadMissing(['teacher', 'student', 'lessonReport', 'lectiClass']);

        $report = $feedback->lessonReport;
        $class  = $feedback->lectiClass;

        // The ScheduleMapper reads class_title / class_subject directly off the row array.
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
    }

    /**
     * Parse and validate the feedback submission body.
     *
     * @param  array<string,mixed>  $body
     * @return array{values: array<string,mixed>, errors: list<string>}
     */
    private function parseFeedbackBody(array $body): array
    {
        $errors = [];

        $rawRating         = $body['overallRating'] ?? null;
        $overallRating     = is_numeric($rawRating) ? (int) $rawRating : null;
        $comments          = trim((string) ($body['comments']          ?? ''));
        $suggestions       = trim((string) ($body['suggestions']       ?? ''));
        $learningExperience = trim((string) ($body['learningExperience'] ?? ''));

        if ($overallRating === null || $overallRating < 1 || $overallRating > 5) {
            $errors[] = 'overallRating must be an integer from 1 to 5.';
        }
        if (!$comments) {
            $errors[] = 'comments are required.';
        }
        if (!$learningExperience) {
            $errors[] = 'learningExperience is required.';
        }

        return [
            'errors' => $errors,
            'values' => [
                'overall_rating'     => $overallRating,
                'comments'           => $comments,
                'suggestions'        => $suggestions,
                'learning_experience'=> $learningExperience,
            ],
        ];
    }

    /**
     * Fan-out feedback-submitted notifications to all admins.
     */
    private function notifyAdminsAboutFeedback(
        StudentFeedback $feedback,
        string $studentName,
        string $lessonTopic
    ): void {
        $adminIds = User::where('role', 'admin')->pluck('id')->all();
        $details  = [
            'feedbackId'     => $feedback->id,
            'lessonReportId' => $feedback->lesson_report_id,
            'classId'        => $feedback->class_id,
            'overallRating'  => $feedback->overall_rating,
            'lessonTopic'    => $lessonTopic,
        ];

        $this->notifications->notifyMany(
            userIds:        $adminIds,
            type:           'student_feedback',
            title:          'Student feedback submitted',
            message:        "{$studentName} submitted feedback for {$lessonTopic} (rating {$feedback->overall_rating}/5).",
            relatedClassId: (int) $feedback->class_id,
            details:        $details,
        );
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    /**
     * GET /api/student-feedback
     * List student feedback accessible to the authenticated user.
     */
    public function listStudentFeedback(Request $request): JsonResponse
    {
        /** @var User $user */
        $user  = $request->user();
        $query = StudentFeedback::query()
            ->orderByDesc('submitted_at')
            ->orderByDesc('id');

        if ($user->isAdmin()) {
            // all feedback
        } elseif ($user->isStudent()) {
            $query->where('student_id', $user->id);
        } elseif ($user->isTeacher()) {
            $query->where('teacher_id', $user->id);
        } else {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $feedback = $query->get()
            ->map(fn (StudentFeedback $f) => $this->hydrateFeedback($f))
            ->values()
            ->all();

        return response()->json($feedback);
    }

    /**
     * POST /api/lesson-reports/{reportId}/feedback
     * Submit student feedback for a lesson report (once-only, student-only).
     */
    public function submitFeedbackForReport(Request $request): JsonResponse
    {
        $reportId = (int) $request->route('reportId');
        if ($reportId < 1) {
            return response()->json(['message' => 'A valid lesson report id is required.'], 400);
        }

        $report = LessonReport::find($reportId);
        if (!$report) {
            return response()->json(['message' => 'Lesson report not found.'], 404);
        }

        /** @var User $user */
        $user = $request->user();
        if (!$user->isStudent() || (int) $report->student_id !== $user->id) {
            return response()->json([
                'message' => 'Only the assigned student can submit feedback for this lesson report.',
            ], 403);
        }

        $existing = StudentFeedback::where('lesson_report_id', $reportId)->first();
        if ($existing) {
            return response()->json([
                'message'  => 'Feedback has already been submitted for this lesson report.',
                'feedback' => $this->hydrateFeedback($existing),
            ], 409);
        }

        ['values' => $values, 'errors' => $errors] = $this->parseFeedbackBody($request->all());
        if (!empty($errors)) {
            return response()->json(['message' => $errors[0], 'errors' => $errors], 400);
        }

        $feedback = StudentFeedback::create(array_merge($values, [
            'lesson_report_id' => $report->id,
            'class_id'         => $report->class_id,
            'student_id'       => $report->student_id,
            'teacher_id'       => $report->teacher_id,
            'submitted_at'     => Carbon::now(),
        ]));

        $student     = $user;
        $studentName = $student->full_name ?: $student->username;
        $this->notifyAdminsAboutFeedback($feedback, $studentName, $report->lesson_topic ?? '');

        $finalization = $this->lifecycle->finalizeClassIfReady((int) $report->class_id);

        $message = ($finalization['newlyArchived'] ?? false)
            ? "Feedback submitted. The class is now Completed and archived into your learning history and the teacher\u{2019}s teaching history."
            : 'Feedback submitted. Thank you — administrators can now review it.';

        $classRow = $finalization['classRow'] ?? null;

        return response()->json([
            'message'           => $message,
            'feedback'          => $this->hydrateFeedback($feedback),
            'classFinalization' => [
                'ready'        => $finalization['ready'],
                'finalized'    => $finalization['finalized'],
                'newlyArchived'=> (bool) ($finalization['newlyArchived'] ?? false),
                'status'       => $classRow?->status ?? null,
                'archivedAt'   => $classRow?->archived_at ?? null,
            ],
        ], 201);
    }

    /**
     * GET /api/lesson-reports/{reportId}/feedback
     * Retrieve feedback for a lesson report (accessible by the report's participants or admin).
     */
    public function getFeedbackForReport(Request $request): JsonResponse
    {
        $reportId = (int) $request->route('reportId');
        if ($reportId < 1) {
            return response()->json(['message' => 'A valid lesson report id is required.'], 400);
        }

        $report = LessonReport::find($reportId);
        if (!$report) {
            return response()->json(['message' => 'Lesson report not found.'], 404);
        }

        /** @var User $user */
        $user      = $request->user();
        $canAccess = $user->isAdmin()
            || (int) $report->student_id === $user->id
            || (int) $report->teacher_id === $user->id;

        if (!$canAccess) {
            return response()->json(['message' => 'Access denied'], 403);
        }

        $feedback = StudentFeedback::where('lesson_report_id', $reportId)->first();
        if (!$feedback) {
            return response()->json(['message' => 'No feedback submitted for this lesson report yet.'], 404);
        }

        return response()->json($this->hydrateFeedback($feedback));
    }
}
