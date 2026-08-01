<?php

use App\Http\Controllers\Api\AdminMonitoringController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AvailabilityController;
use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\ClassController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\HomeworkController;
use App\Http\Controllers\Api\LessonReportController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PaymentReceiptController;
use App\Http\Controllers\Api\ScheduleRequestController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\StudentFeedbackController;
use App\Http\Controllers\Api\TrialRequestController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

// ── Health ────────────────────────────────────────────────────────────────────
Route::get('/health', function () {
    return response()->json([
        'ok'        => true,
        'service'   => 'LectiHub API',
        'framework' => 'Laravel ' . app()->version(),
    ]);
});

// ── Auth ──────────────────────────────────────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login',    [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me',       [AuthController::class, 'me']);
        Route::post('/logout',  [AuthController::class, 'logout']);
    });
});

// ── Free-trial intake (public — no auth) ─────────────────────────────────────
Route::prefix('trial-requests')->group(function () {
    Route::get('/config', [TrialRequestController::class, 'getTrialConfig']);
    Route::post('/',      [TrialRequestController::class, 'createFreeTrialRequest']);
});

// ── Authenticated routes ──────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // ── Users (admin) ─────────────────────────────────────────────────────────
    Route::prefix('users')->middleware('role:admin')->group(function () {
        Route::get('/',          [UserController::class, 'listUsers']);
        Route::post('/create',   [UserController::class, 'createUser']);
        Route::delete('/{id}',   [UserController::class, 'deleteUser']);
    });

    // ── Schedule requests ─────────────────────────────────────────────────────
    Route::prefix('schedule-requests')->group(function () {
        // Student-only
        Route::post('/',       [ScheduleRequestController::class, 'createScheduleRequest'])
            ->middleware('role:student');
        Route::get('/mine',    [ScheduleRequestController::class, 'listMyScheduleRequests'])
            ->middleware('role:student');

        // Admin-only  (static /mine declared first so it isn't swallowed by /{id})
        Route::get('/',        [ScheduleRequestController::class, 'listScheduleRequestsForAdmin'])
            ->middleware('role:admin');
        Route::get('/{id}',    [ScheduleRequestController::class, 'getScheduleRequestForAdmin'])
            ->middleware('role:admin');
        Route::post('/{id}/assign', [ScheduleRequestController::class, 'assignTeacherToRequest'])
            ->middleware('role:admin');
    });

    // ── Notifications (all authenticated roles) ───────────────────────────────
    Route::prefix('notifications')->group(function () {
        Route::get('/',              [NotificationController::class, 'listMyNotifications']);
        Route::patch('/read-all',    [NotificationController::class, 'markAllNotificationsRead']);
        Route::patch('/{id}/read',   [NotificationController::class, 'markNotificationRead']);
    });

    // ── Classes ───────────────────────────────────────────────────────────────
    Route::prefix('classes')->group(function () {
        Route::get('/mine',                 [ClassController::class, 'listMyClasses'])
            ->middleware('role:student,teacher,admin');
        Route::get('/history',              [ClassController::class, 'listClassHistory'])
            ->middleware('role:student,teacher,admin');
        Route::get('/by-request/{requestId}', [ClassController::class, 'getClassByRequest']);

        Route::post('/{id}/join',           [ClassController::class, 'joinClass'])
            ->middleware('role:student,teacher,admin');
        Route::patch('/{id}/meeting-provider', [ClassController::class, 'updateMeetingProvider'])
            ->middleware('role:student,teacher,admin');
        Route::patch('/{id}/conduct',       [ClassController::class, 'updateLessonConduct'])
            ->middleware('role:teacher,admin');
        Route::post('/{id}/complete',       [ClassController::class, 'completeClass'])
            ->middleware('role:teacher,admin');

        Route::get('/{id}/report',          [LessonReportController::class, 'getLessonReportForClass'])
            ->middleware('role:student,teacher,admin');
        Route::post('/{id}/report',         [LessonReportController::class, 'submitLessonReport'])
            ->middleware('role:teacher,admin');
    });

    // ── Lesson reports ────────────────────────────────────────────────────────
    Route::prefix('lesson-reports')->group(function () {
        Route::get('/', [LessonReportController::class, 'listLessonReports'])
            ->middleware('role:student,teacher,admin');

        // /{reportId}/feedback before /{reportId} to avoid parameter capture
        Route::post('/{reportId}/feedback', [StudentFeedbackController::class, 'submitFeedbackForReport'])
            ->middleware('role:student');
        Route::get('/{reportId}/feedback',  [StudentFeedbackController::class, 'getFeedbackForReport'])
            ->middleware('role:student,teacher,admin');
        Route::get('/{reportId}',           [LessonReportController::class, 'getLessonReportById'])
            ->middleware('role:student,teacher,admin');
    });

    // ── Student feedback ──────────────────────────────────────────────────────
    Route::get('/student-feedback', [StudentFeedbackController::class, 'listStudentFeedback'])
        ->middleware('role:student,teacher,admin');

    // ── Announcements ─────────────────────────────────────────────────────────
    Route::prefix('announcements')->group(function () {
        // Static /mine before /{id} so it isn't swallowed.
        Route::get('/mine', [AnnouncementController::class, 'listMine'])
            ->middleware('role:student,teacher,admin');
        Route::patch('/{id}/read', [AnnouncementController::class, 'markRead'])
            ->middleware('role:student,teacher,admin');

        Route::get('/',             [AnnouncementController::class, 'listAnnouncements'])->middleware('role:admin');
        Route::post('/',            [AnnouncementController::class, 'createAnnouncement'])->middleware('role:admin');
        Route::post('/preview',     [AnnouncementController::class, 'previewAudience'])->middleware('role:admin');
        Route::post('/{id}/send',   [AnnouncementController::class, 'sendAnnouncement'])->middleware('role:admin');
        Route::patch('/{id}',       [AnnouncementController::class, 'updateAnnouncement'])->middleware('role:admin');
        Route::delete('/{id}',      [AnnouncementController::class, 'deleteAnnouncement'])->middleware('role:admin');
    });

    // ── Homework & grades ─────────────────────────────────────────────────────
    Route::prefix('homework')->group(function () {
        Route::get('/', [HomeworkController::class, 'listHomework'])
            ->middleware('role:student,teacher,admin');
        Route::post('/', [HomeworkController::class, 'createHomework'])
            ->middleware('role:teacher,admin');

        Route::post('/{id}/submit', [HomeworkController::class, 'submitHomework'])
            ->middleware('role:student');
        Route::post('/{id}/grade', [HomeworkController::class, 'gradeHomework'])
            ->middleware('role:teacher,admin');
        Route::get('/{id}/file', [HomeworkController::class, 'downloadSubmission'])
            ->middleware('role:student,teacher,admin');
        Route::delete('/{id}', [HomeworkController::class, 'deleteHomework'])
            ->middleware('role:teacher,admin');
    });

    // ── Courses & materials ───────────────────────────────────────────────────
    Route::prefix('courses')->group(function () {
        // Students see only what they are enrolled in; staff see everything.
        Route::get('/', [CourseController::class, 'listCourses'])
            ->middleware('role:student,teacher,admin');

        Route::post('/',        [CourseController::class, 'createCourse'])->middleware('role:admin');
        Route::patch('/{id}',   [CourseController::class, 'updateCourse'])->middleware('role:admin');
        Route::delete('/{id}',  [CourseController::class, 'deleteCourse'])->middleware('role:admin');

        Route::get('/{id}/materials', [CourseController::class, 'listMaterials'])
            ->middleware('role:student,teacher,admin');
        // Only admins upload course materials; teachers/students view them.
        Route::post('/{id}/materials', [CourseController::class, 'uploadMaterial'])
            ->middleware('role:admin');

        Route::get('/{id}/enrolments', [CourseController::class, 'listEnrolments'])
            ->middleware('role:admin');
        Route::put('/{id}/enrolments', [CourseController::class, 'updateEnrolments'])
            ->middleware('role:admin');
    });

    Route::prefix('materials')->group(function () {
        // In-browser view (does not consume student download quota).
        Route::get('/{id}/preview', [CourseController::class, 'previewMaterial'])
            ->middleware('role:student,teacher,admin');
        // Students: 3 downloads per page; teachers view-only; admin unlimited.
        Route::get('/{id}/download', [CourseController::class, 'downloadMaterial'])
            ->middleware('role:student,admin');
        Route::patch('/{id}', [CourseController::class, 'updateMaterial'])
            ->middleware('role:admin');
        Route::post('/{id}', [CourseController::class, 'updateMaterial'])
            ->middleware('role:admin');
        Route::delete('/{id}', [CourseController::class, 'deleteMaterial'])
            ->middleware('role:admin');
    });

    // Centre settings any signed-in user may read (slot length, hours, notice).
    Route::get('/settings', [SettingsController::class, 'publicSettings'])
        ->middleware('role:student,teacher,admin');

    // ── Admin monitoring, audit & settings ────────────────────────────────────
    Route::prefix('admin')->middleware('role:admin')->group(function () {
        Route::get('/monitoring', [AdminMonitoringController::class, 'getMonitoringOverview']);
        Route::get('/audit',      [AuditController::class, 'listEvents']);
        Route::get('/settings',   [SettingsController::class, 'show']);
        Route::put('/settings',   [SettingsController::class, 'update']);
    });

    // ── Calendar ──────────────────────────────────────────────────────────────
    Route::prefix('calendar')->group(function () {
        Route::get('/mine',                    [CalendarController::class, 'getMyCalendar'])
            ->middleware('role:student,teacher,admin');
        Route::post('/connect',                [CalendarController::class, 'connectCalendarProvider'])
            ->middleware('role:teacher');
        Route::delete('/connect/{provider}',   [CalendarController::class, 'disconnectCalendarProvider'])
            ->middleware('role:teacher');
    });

    // ── Availability ──────────────────────────────────────────────────────────
    Route::prefix('availability')->group(function () {
        Route::get('/open',  [AvailabilityController::class, 'getOpenAvailability'])
            ->middleware('role:student,admin');
        Route::get('/mine',  [AvailabilityController::class, 'getMyAvailability'])
            ->middleware('role:teacher');
        Route::put('/mine',  [AvailabilityController::class, 'updateMyAvailability'])
            ->middleware('role:teacher');
    });

    // ── Chat ──────────────────────────────────────────────────────────────────
    Route::prefix('chat')->middleware('role:student,teacher')->group(function () {
        Route::get('/threads',                     [ChatController::class, 'listChatThreads']);
        Route::get('/peers/{peerId}/messages',     [ChatController::class, 'listMessagesForPeer']);
        Route::post('/peers/{peerId}/messages',    [ChatController::class, 'sendMessageForPeer']);
    });

    // ── Payment receipts ──────────────────────────────────────────────────────
    Route::prefix('payment-receipts')->group(function () {
        Route::post('/',     [PaymentReceiptController::class, 'createPaymentReceipt'])
            ->middleware('role:student,admin');
        Route::get('/mine',  [PaymentReceiptController::class, 'listMyPaymentReceipts'])
            ->middleware('role:student');
        Route::get('/',      [PaymentReceiptController::class, 'listPaymentReceipts'])
            ->middleware('role:admin');
        Route::get('/{id}',  [PaymentReceiptController::class, 'getPaymentReceipt'])
            ->middleware('role:student,admin');
        Route::patch('/{id}', [PaymentReceiptController::class, 'updatePaymentReceiptStatus'])
            ->middleware('role:admin');
    });
});
