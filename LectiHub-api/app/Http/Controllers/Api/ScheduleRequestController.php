<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LectiClass;
use App\Models\ScheduleRequest;
use App\Models\ScheduleRequestSlot;
use App\Models\User;
use App\Services\AvailabilityService;
use App\Services\CalendarSyncService;
use App\Services\ConflictService;
use App\Services\EmailService;
use App\Services\NotificationService;
use App\Services\ScheduleBookingService;
use App\Services\ScheduleMapper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ScheduleRequestController extends Controller
{
    public const DATE_PATTERN      = '/^\d{4}-\d{2}-\d{2}$/';
    public const TIME_SLOT_PATTERN = '/^\d{2}:\d{2}-\d{2}:\d{2}$/';

    public function __construct(
        protected ScheduleBookingService $booking,
        protected ScheduleMapper         $mapper,
        protected AvailabilityService    $availability,
        protected ConflictService        $conflict,
        protected CalendarSyncService    $calendar,
        protected EmailService           $email,
        protected NotificationService    $notifications,
    ) {}

    // -----------------------------------------------------------------------
    // POST /schedule-requests  (student)
    // -----------------------------------------------------------------------

    public function createScheduleRequest(Request $request): JsonResponse
    {
        $slots   = $request->input('slots');
        $remarks = $request->input('remarks');

        if (!is_array($slots) || empty($slots)) {
            return response()->json(['message' => 'Select at least one date and time slot to book'], 400);
        }

        /** @var User $authUser */
        $authUser  = $request->user();
        $earliest  = $this->availability->earliestBookableDate();
        $leadDays  = $this->availability->bookingLeadDays();

        $normalizedSlots = [];
        $seen            = [];

        foreach ($slots as $slot) {
            $preferredDate = substr((string) ($slot['preferredDate'] ?? $slot['preferred_date'] ?? ''), 0, 10);
            $timeSlot      = trim((string) ($slot['timeSlot'] ?? $slot['time_slot'] ?? ''));

            if (!preg_match(self::DATE_PATTERN, $preferredDate)) {
                return response()->json(['message' => 'Each slot needs a valid date (YYYY-MM-DD)'], 400);
            }
            if (!preg_match(self::TIME_SLOT_PATTERN, $timeSlot)) {
                return response()->json(['message' => 'Each slot needs a valid time range (HH:MM-HH:MM)'], 400);
            }
            if ($preferredDate < $earliest) {
                return response()->json([
                    'message' => "Booked dates must be at least {$leadDays} days from today (earliest: {$earliest}).",
                ], 400);
            }

            $key = "{$preferredDate}|{$timeSlot}";
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key]        = true;
            $normalizedSlots[] = ['preferredDate' => $preferredDate, 'timeSlot' => $timeSlot];
        }

        if (empty($normalizedSlots)) {
            return response()->json(['message' => 'Select at least one date and time slot to book'], 400);
        }

        // Group into contiguous class blocks
        $blocks = $this->booking->groupContiguousBlocks($normalizedSlots);

        // Overlap check per merged block window
        foreach ($blocks as $block) {
            $window   = $this->booking->mergeBlockWindow($block);
            $existing = $this->booking->studentHasOverlappingBooking(
                $authUser->id,
                $window['classDate'],
                $window['timeSlot']
            );

            if ($existing === 'pending') {
                return response()->json([
                    'message' => "You already have a pending booking overlapping {$window['classDate']} {$window['timeSlot']}.",
                ], 409);
            }
            if ($existing === 'scheduled') {
                return response()->json([
                    'message' => "You already have a class overlapping {$window['classDate']} {$window['timeSlot']}.",
                ], 409);
            }
        }

        $cleanRemarks  = is_string($remarks) ? trim($remarks) : '';
        $student       = User::find($authUser->id);
        $studentName   = $student?->full_name ?? $student?->username ?? 'A student';

        try {
            $requestIds = DB::transaction(function () use ($authUser, $blocks, $cleanRemarks, $student, $studentName) {
                $createdIds = [];

                foreach ($blocks as $block) {
                    $scheduleRequest = ScheduleRequest::create([
                        'student_id' => $authUser->id,
                        'remarks'    => $cleanRemarks ?: null,
                        'status'     => 'pending',
                    ]);

                    foreach ($block as $slot) {
                        ScheduleRequestSlot::create([
                            'request_id'     => $scheduleRequest->id,
                            'preferred_date' => $slot['preferredDate'],
                            'time_slot'      => $slot['timeSlot'],
                        ]);
                    }

                    $createdIds[] = $scheduleRequest->id;
                }

                $this->booking->notifyAdminsAboutRequests($createdIds, $studentName, count($createdIds));

                return $createdIds;
            });

            $mappedRequests = array_map(function (int $reqId) use ($student) {
                $req   = ScheduleRequest::find($reqId);
                $slots = $this->booking->getSlotsForRequest($reqId);
                return $this->booking->mapRequestRow($req, $slots, $student);
            }, $requestIds);

            $count   = count($mappedRequests);
            $message = $count === 1
                ? 'Class booking submitted. An admin will assign one teacher to the full session.'
                : "{$count} class bookings submitted (non-consecutive times become separate classes). An admin will assign a teacher to each.";

            return response()->json(array_merge(
                ['message' => $message, 'count' => $count, 'requests' => $mappedRequests],
                $mappedRequests[0]
            ), 201);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error creating schedule request', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /schedule-requests/mine  (student — bare array)
    // -----------------------------------------------------------------------

    public function listMyScheduleRequests(Request $request): JsonResponse
    {
        try {
            /** @var User $authUser */
            $authUser = $request->user();

            $requests = ScheduleRequest::where('student_id', $authUser->id)
                ->orderByDesc('created_at')
                ->get();

            $result = $requests->map(function (ScheduleRequest $req) {
                $slots   = $this->booking->getSlotsForRequest($req->id);
                $student = User::find($req->student_id);
                $teacher = $req->assigned_teacher_id ? User::find($req->assigned_teacher_id) : null;
                return $this->booking->mapRequestRow($req, $slots, $student, $teacher);
            })->all();

            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error loading schedule requests', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /admin/schedule-requests  (?status=pending|approved|rejected|all)
    // -----------------------------------------------------------------------

    public function listScheduleRequestsForAdmin(Request $request): JsonResponse
    {
        try {
            $status  = is_string($request->query('status')) ? $request->query('status') : 'pending';
            $allowed = ['pending', 'approved', 'rejected', 'all'];

            if (!in_array($status, $allowed, true)) {
                return response()->json(['message' => 'Invalid status filter'], 400);
            }

            $query = ScheduleRequest::orderByDesc('created_at');
            if ($status !== 'all') {
                $query->where('status', $status);
            }

            $result = $query->get()->map(function (ScheduleRequest $req) {
                $slots   = $this->booking->getSlotsForRequest($req->id);
                $student = User::find($req->student_id);
                $teacher = $req->assigned_teacher_id ? User::find($req->assigned_teacher_id) : null;
                return $this->booking->mapRequestRow($req, $slots, $student, $teacher);
            })->all();

            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error loading schedule requests', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /admin/schedule-requests/:id  (full scoring object)
    // -----------------------------------------------------------------------

    public function getScheduleRequestForAdmin(Request $request, int $id): JsonResponse
    {
        try {
            $requestId = $id;
            if ($requestId < 1) {
                return response()->json(['message' => 'Invalid request id'], 400);
            }

            $scheduleRequest = ScheduleRequest::find($requestId);
            if (!$scheduleRequest) {
                return response()->json(['message' => 'Schedule request not found'], 404);
            }

            $slots           = $this->booking->getSlotsForRequest($requestId);
            $student         = User::find($scheduleRequest->student_id);
            $assignedTeacher = $scheduleRequest->assigned_teacher_id
                ? User::find($scheduleRequest->assigned_teacher_id)
                : null;

            $availability      = $this->booking->buildAvailability($slots, $scheduleRequest->remarks);
            $confirmedSchedule = $this->resolveConfirmedSchedule($requestId);

            return response()->json(array_merge([
                'request'          => $this->booking->mapRequestRow($scheduleRequest, $slots, $student, $assignedTeacher),
                'confirmedSchedule'=> $confirmedSchedule,
            ], $availability));
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error loading schedule request', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /admin/schedule-requests/:id/assign
    // -----------------------------------------------------------------------

    public function assignTeacherToRequest(Request $request, int $id): JsonResponse
    {
        try {
            $requestId = $id;
            $teacherId = (int) $request->input('teacherId');

            if ($requestId < 1) {
                return response()->json(['message' => 'Invalid request id'], 400);
            }
            if ($teacherId < 1) {
                return response()->json(['message' => 'teacherId is required'], 400);
            }

            $scheduleRequest = ScheduleRequest::find($requestId);
            if (!$scheduleRequest) {
                return response()->json(['message' => 'Schedule request not found'], 404);
            }
            if ($scheduleRequest->status !== 'pending') {
                return response()->json(['message' => 'Only pending requests can be assigned'], 400);
            }

            $teacher = User::where('id', $teacherId)->where('role', 'teacher')->first();
            if (!$teacher) {
                return response()->json(['message' => 'Teacher not found'], 400);
            }

            $slots = $this->booking->getSlotsForRequest($requestId);
            if (empty($slots)) {
                return response()->json(['message' => 'Request has no booked slots'], 400);
            }

            // Map DB slots to camelCase for grouping (mirrors JS slot.map in assignTeacherToRequest)
            $camelSlots = array_map(fn ($s) => [
                'id'            => $s['id'],
                'preferredDate' => $s['preferred_date'],
                'timeSlot'      => $s['time_slot'],
            ], $slots);

            $blocks = $this->booking->groupContiguousBlocks($camelSlots);
            if (count($blocks) !== 1) {
                return response()->json([
                    'message' => 'This booking must be one contiguous class block before assignment',
                ], 400);
            }

            $block  = $blocks[0];
            $window = $this->booking->mergeBlockWindow($block);
            $slotId = $window['firstSlotId'];

            // Validate teacher offers AND has no conflict for every individual segment
            foreach ($block as $slot) {
                $date     = $this->booking->slotDate($slot);
                $timeSlot = $this->booking->slotTime($slot);

                if (!$this->availability->teacherOffersSlot($teacherId, $date, $timeSlot)) {
                    return response()->json([
                        'message' => 'Teacher does not offer availability for the full class block',
                    ], 409);
                }
                if ($this->conflict->teacherHasConflict($teacherId, $date, $timeSlot) !== null) {
                    return response()->json([
                        'message' => 'Teacher has a schedule conflict during the class block',
                    ], 409);
                }
            }

            // Belt-and-suspenders: also check the merged window slot
            if ($this->conflict->teacherHasConflict($teacherId, $window['classDate'], $window['timeSlot']) !== null) {
                return response()->json([
                    'message' => 'Teacher has a schedule conflict for the selected class block',
                ], 409);
            }

            /** @var User $authUser */
            $authUser    = $request->user();
            $student     = User::find($scheduleRequest->student_id);
            $studentName = $student?->full_name ?? $student?->username ?? 'Student';
            $teacherName = $teacher->full_name ?? $teacher->username;

            ['classDate' => $classDate, 'startTime' => $startTime, 'endTime' => $endTime,
             'durationMinutes' => $durationMinutes, 'timeSlot' => $timeSlot] = $window;

            ['meetingInfo' => $meetingInfo, 'meetingLink' => $meetingLink, 'meetingProvider' => $meetingProvider] =
                $this->mapper->buildMeetingDetails(
                    $requestId,
                    $classDate,
                    $startTime,
                    $scheduleRequest->preferred_meeting_provider
                );

            $subject = trim((string) ($teacher->subject_expertise ?? '')) ?: 'General';
            $title   = "{$subject} lesson · {$studentName} with {$teacherName}";

            $scheduleDetails = [
                'studentName'     => $studentName,
                'teacherName'     => $teacherName,
                'classDate'       => $classDate,
                'timeSlot'        => $timeSlot,
                'startTime'       => $startTime,
                'endTime'         => $endTime,
                'durationMinutes' => $durationMinutes,
                'subject'         => $subject,
                'meetingInfo'     => $meetingInfo,
                'meetingLink'     => $meetingLink,
            ];

            $createdClass = DB::transaction(function () use (
                $scheduleRequest, $scheduleDetails, $slotId, $authUser, $teacherId, $requestId,
                $classDate, $timeSlot, $title, $startTime, $endTime, $durationMinutes,
                $meetingInfo, $meetingLink, $meetingProvider, $subject, $student,
                $studentName, $teacherName
            ) {
                ScheduleRequest::where('id', $requestId)->where('status', 'pending')->update([
                    'status'              => 'approved',
                    'assigned_teacher_id' => $teacherId,
                    'assigned_slot_id'    => $slotId,
                    'assigned_by'         => $authUser->id,
                    'assigned_at'         => now(),
                ]);

                $cls = LectiClass::create([
                    'teacher_id'          => $teacherId,
                    'student_id'          => $scheduleRequest->student_id,
                    'class_date'          => $classDate,
                    'time_slot'           => $timeSlot,
                    'title'               => $title,
                    'schedule_request_id' => $requestId,
                    'start_time'          => $startTime,
                    'end_time'            => $endTime,
                    'duration_minutes'    => $durationMinutes,
                    'meeting_info'        => $meetingInfo,
                    'meeting_link'        => $meetingLink,
                    'meeting_provider'    => $meetingProvider,
                    'status'              => 'scheduled',
                    'subject'             => $subject,
                ]);

                $classId = $cls->id;

                $studentMessage = implode("\n", [
                    "Assigned teacher: {$teacherName}",
                    "Schedule: {$classDate} {$startTime} – {$endTime} ({$durationMinutes} minutes)",
                    "Meeting information: {$meetingInfo}",
                    "Meeting link: {$meetingLink}",
                    'Reminders: you will also receive notifications 24 hours and 1 hour before class begins.',
                ]);

                $this->notifications->createNotification(
                    $scheduleRequest->student_id,
                    'schedule_confirmed',
                    'Your class schedule is confirmed',
                    $studentMessage,
                    $requestId,
                    $classId,
                    array_merge($scheduleDetails, ['remindersScheduled' => ['24h', '1h']])
                );

                $this->booking->scheduleStudentReminders(
                    $scheduleRequest->student_id,
                    $requestId,
                    $classId,
                    $scheduleDetails
                );

                $teacherMessage = implode("\n", [
                    "Assigned student: {$studentName}",
                    "Date and time: {$classDate} {$startTime} – {$endTime}",
                    "Class duration: {$durationMinutes} minutes",
                    "Meeting details: {$meetingInfo}",
                    "Meeting link: {$meetingLink}",
                ]);

                $this->notifications->createNotification(
                    $teacherId,
                    'schedule_confirmed',
                    'New class assignment confirmed',
                    $teacherMessage,
                    $requestId,
                    $classId,
                    $scheduleDetails
                );

                return $cls;
            });

            $updatedRequest = ScheduleRequest::find($requestId);
            $updatedSlots   = $this->booking->getSlotsForRequest($requestId);
            $confirmedClass = LectiClass::find($createdClass->id);
            $confirmedSchedule = $this->mapper->mapClassRow($confirmedClass, $teacher, $student);

            $calendarSync = $this->calendar->syncClassToCalendars(
                $createdClass,
                $scheduleRequest->student_id,
                $teacherId
            );

            $emailResult = $this->email->sendScheduleConfirmationEmails(
                $student ? $student->toArray() : null,
                $teacher->toArray(),
                $scheduleDetails
            );

            $message = $emailResult['enabled']
                ? 'Teacher assigned, schedule confirmed, calendars synced, and confirmation emails processed'
                : 'Teacher assigned, schedule confirmed, and calendars synced';

            return response()->json([
                'message'           => $message,
                'request'           => $this->booking->mapRequestRow($updatedRequest, $updatedSlots, $student, $teacher),
                'confirmedSchedule' => $confirmedSchedule,
                'calendarSync'      => $calendarSync,
                'emails'            => $emailResult,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error assigning teacher', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private function resolveConfirmedSchedule(int $requestId): ?array
    {
        $classRow = LectiClass::where('schedule_request_id', $requestId)
            ->orderByDesc('id')
            ->first();

        if (!$classRow) {
            return null;
        }

        $teacher = User::find($classRow->teacher_id);
        $student = User::find($classRow->student_id);

        return $this->mapper->mapClassRow($classRow, $teacher, $student);
    }
}
