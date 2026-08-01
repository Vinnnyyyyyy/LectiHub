<?php

namespace App\Services;

use App\Models\ScheduleRequest;
use App\Models\ScheduleRequestSlot;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Handles free-trial lead intake into the E-Scheduler queue.
 * Mirrors trialScheduler.js.
 *
 * Responsibilities:
 *  1. Find or create a provisional student account from the lead's email.
 *  2. Insert a pending schedule_request (source=free_trial) + its slot.
 *  3. Notify all admins about the new trial request.
 */
class TrialSchedulerService
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly SettingsService $settings,
    ) {}

    // -----------------------------------------------------------------------
    // Username helpers (matches slugUsername / uniqueUsername in JS)
    // -----------------------------------------------------------------------

    private function slugUsername(string $email, string $name): string
    {
        $local = strtolower(explode('@', $email)[0]);
        $local = preg_replace('/[^a-z0-9]+/', '_', $local);
        $local = trim($local, '_');
        $local = substr($local, 0, 18);

        $fromName = strtolower($name);
        $fromName = preg_replace('/[^a-z0-9]+/', '_', $fromName);
        $fromName = trim($fromName, '_');
        $fromName = substr($fromName, 0, 12);

        $base = $local ?: $fromName ?: 'trial';
        return substr("trial_{$base}", 0, 28);
    }

    private function uniqueUsername(string $base): string
    {
        $candidate = $base;
        $i         = 0;
        while (User::where('username', $candidate)->exists()) {
            $i++;
            $candidate = substr($base, 0, 24) . "_{$i}";
        }
        return $candidate;
    }

    // -----------------------------------------------------------------------
    // Find-or-create student
    // -----------------------------------------------------------------------

    /**
     * Find an existing student by email or create a provisional student account.
     *
     * @param  array<string,mixed>  $trial  Must contain: email, name
     * @return array{student: User, created: bool}
     *
     * @throws RuntimeException when the email belongs to a non-student account (409)
     */
    public function findOrCreateTrialStudent(array $trial): array
    {
        $email    = strtolower(trim($trial['email']));
        $existing = User::whereRaw('LOWER(email) = ?', [$email])->first();

        if ($existing) {
            if ($existing->role !== 'student') {
                throw new RuntimeException(
                    'This email is already used by a LectiHub account that is not a student. '
                    . 'Use a different email for the free trial.',
                    409
                );
            }
            return ['student' => $existing, 'created' => false];
        }

        $password = Str::random(24);
        $username = $this->uniqueUsername($this->slugUsername($email, $trial['name'] ?? ''));

        $student = User::create([
            'username'             => $username,
            'email'                => $email,
            'password'             => Hash::make($password),
            'role'                 => 'student',
            'full_name'            => $trial['name'] ?? null,
            'must_change_password' => true,
        ]);

        return ['student' => $student, 'created' => true];
    }

    // -----------------------------------------------------------------------
    // Admin notifications
    // -----------------------------------------------------------------------

    /**
     * Fan-out a "new free trial" notification to every admin.
     *
     * @param  array<string,mixed>  $trial
     */
    private function notifyAdmins(int $requestId, array $trial): void
    {
        $adminIds = User::where('role', 'admin')->pluck('id')->all();

        $name     = $trial['name']              ?? 'Unknown';
        $program  = $trial['program']           ?? '';
        $date     = $trial['preferredDate']     ?? '';
        $slot     = $trial['preferredSlot']     ?? '';
        $platform = $trial['videoPlatformLabel'] ?? $trial['videoPlatform'] ?? '';

        $message = "{$name} requested a free 30-min trial ({$program}) on {$date} {$slot} via {$platform}.";

        $this->notifications->notifyMany(
            userIds:           $adminIds,
            type:              'schedule_request',
            title:             'New free trial booking',
            message:           $message,
            relatedRequestId:  $requestId,
            relatedClassId:    null,
            details: [
                'source'         => 'free_trial',
                'studentName'    => $name,
                'program'        => $program,
                'preferredDate'  => $date,
                'preferredSlot'  => $slot,
                'videoPlatform'  => $trial['videoPlatform'] ?? '',
                'classCount'     => 1,
                'requestIds'     => [$requestId],
            ]
        );
    }

    // -----------------------------------------------------------------------
    // Main action
    // -----------------------------------------------------------------------

    /**
     * Create a pending schedule request (source=free_trial) from a free-trial
     * form submission, find-or-create the provisional student, and notify admins.
     *
     * @param  array<string,mixed>  $trial
     *   Required: email, name, program, entityType, videoPlatform,
     *             videoPlatformLabel, preferredDate, preferredSlot
     *
     * @return array{requestId: int, studentId: int, studentUsername: string}
     */
    public function createTrialScheduleRequest(array $trial): array
    {
        ['student' => $student] = $this->findOrCreateTrialStudent($trial);

        $entityLabel = ($trial['entityType'] ?? '') === 'company' ? 'Company' : 'Individual';
        $slotMinutes = (int) $this->settings->get('scheduling.slot_minutes', 30);
        if (! in_array($slotMinutes, [30, 60], true)) {
            $slotMinutes = 30;
        }
        $remarks     = implode(' · ', array_filter([
            "Free trial ({$slotMinutes} minutes)",
            'Program: ' . ($trial['program'] ?? ''),
            "Company / Individual: {$entityLabel}",
            'Preferred platform: ' . ($trial['videoPlatformLabel'] ?? $trial['videoPlatform'] ?? ''),
        ]));

        $requestId = DB::transaction(function () use ($student, $trial, $remarks): int {
            $scheduleRequest = ScheduleRequest::create([
                'student_id'                 => $student->id,
                'remarks'                    => $remarks,
                'status'                     => 'pending',
                'source'                     => 'free_trial',
                'program'                    => $trial['program']       ?? null,
                'entity_type'                => $trial['entityType']    ?? null,
                'preferred_meeting_provider' => $trial['videoPlatform'] ?? null,
            ]);

            ScheduleRequestSlot::create([
                'request_id'     => $scheduleRequest->id,
                'preferred_date' => $trial['preferredDate'] ?? null,
                'time_slot'      => $trial['preferredSlot'] ?? null,
            ]);

            $this->notifyAdmins($scheduleRequest->id, $trial);

            return $scheduleRequest->id;
        });

        return [
            'requestId'       => $requestId,
            'studentId'       => $student->id,
            'studentUsername' => $student->username,
        ];
    }
}
