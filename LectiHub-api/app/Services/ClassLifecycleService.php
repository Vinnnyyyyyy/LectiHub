<?php

namespace App\Services;

use App\Models\LectiClass;
use App\Models\LessonReport;
use App\Models\StudentFeedback;
use Carbon\Carbon;

/**
 * Handles class lifecycle transitions.
 * Mirrors classLifecycle.js: finalizeClassIfReady.
 *
 * A class is "ready" to be finalized once BOTH:
 *   • a lesson_report exists for the class, AND
 *   • a student_feedback exists linked to that report.
 *
 * On finalisation the class status is set to "completed" and archived_at is
 * stamped (both are COALESCE-style: never overwrite an existing timestamp).
 */
class ClassLifecycleService
{
    /**
     * Attempt to finalise a class.
     *
     * @return array{
     *   ready: bool,
     *   finalized: bool,
     *   newlyArchived?: bool,
     *   reason?: string,
     *   hasLessonReport: bool,
     *   hasStudentFeedback: bool,
     *   lessonReportId?: int,
     *   feedbackId?: int,
     *   classRow?: LectiClass
     * }
     */
    public function finalizeClassIfReady(int $classId): array
    {
        $report = LessonReport::where('class_id', $classId)->first();

        if (!$report) {
            return [
                'ready'             => false,
                'finalized'         => false,
                'reason'            => 'missing_report',
                'hasLessonReport'   => false,
                'hasStudentFeedback'=> false,
            ];
        }

        $feedback = StudentFeedback::where('lesson_report_id', $report->id)->first();

        if (!$feedback) {
            return [
                'ready'             => false,
                'finalized'         => false,
                'reason'            => 'missing_feedback',
                'hasLessonReport'   => true,
                'hasStudentFeedback'=> false,
                'lessonReportId'    => $report->id,
            ];
        }

        $lectiClass = LectiClass::find($classId);

        if (!$lectiClass) {
            return [
                'ready'             => true,
                'finalized'         => false,
                'reason'            => 'class_not_found',
                'hasLessonReport'   => true,
                'hasStudentFeedback'=> true,
                'lessonReportId'    => $report->id,
                'feedbackId'        => $feedback->id,
            ];
        }

        $alreadyArchived = $lectiClass->archived_at !== null;
        $now             = Carbon::now();

        // Only stamp timestamps that are not already set (COALESCE behaviour).
        if ($lectiClass->completed_at === null) {
            $lectiClass->completed_at = $now;
        }
        if ($lectiClass->archived_at === null) {
            $lectiClass->archived_at = $now;
        }
        $lectiClass->status = 'completed';
        $lectiClass->save();

        $lectiClass->refresh();

        return [
            'ready'             => true,
            'finalized'         => true,
            'newlyArchived'     => !$alreadyArchived,
            'hasLessonReport'   => true,
            'hasStudentFeedback'=> true,
            'lessonReportId'    => $report->id,
            'feedbackId'        => $feedback->id,
            'classRow'          => $lectiClass,
        ];
    }
}
