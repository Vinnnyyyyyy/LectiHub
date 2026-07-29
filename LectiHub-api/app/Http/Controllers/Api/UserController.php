<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AvailabilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    public function __construct(
        private readonly AvailabilityService $availability,
    ) {}

    // -----------------------------------------------------------------------
    // Mapper
    // -----------------------------------------------------------------------

    private function mapUser(User $user): array
    {
        return [
            'id'        => $user->id,
            'username'  => $user->username,
            'email'     => $user->email ?? '',
            'fullName'  => $user->full_name ?? $user->username,
            'role'      => $user->role,
            'createdAt' => $user->created_at,
        ];
    }

    // -----------------------------------------------------------------------
    // GET /users  (?role=admin|teacher|student)
    // -----------------------------------------------------------------------

    public function listUsers(Request $request): JsonResponse
    {
        try {
            $role = strtolower(trim((string) ($request->query('role', ''))));
            $validRoles = ['admin', 'teacher', 'student'];

            if ($role && in_array($role, $validRoles, true)) {
                $users = User::where('role', $role)
                    ->orderBy('full_name')
                    ->orderBy('username')
                    ->get();
            } else {
                $users = User::orderByRaw("CASE role WHEN 'admin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END")
                    ->orderBy('full_name')
                    ->orderBy('username')
                    ->get();
            }

            return response()->json(['users' => $users->map(fn ($u) => $this->mapUser($u))->all()]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Unable to list users.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /users  (admin only — creates teacher accounts)
    // -----------------------------------------------------------------------

    public function createUser(Request $request): JsonResponse
    {
        $username         = $request->input('username');
        $email            = $request->input('email');
        $password         = $request->input('password');
        $fullName         = $request->input('full_name');
        $subjectExpertise = $request->input('subject_expertise');

        if (!$username || !$password) {
            return response()->json(['message' => 'username and password are required.'], 400);
        }

        $roleInput = $request->input('role');
        if ($roleInput && strtolower((string) $roleInput) !== 'teacher') {
            return response()->json([
                'message' => 'Admins can only create teacher accounts. Students register themselves.',
            ], 400);
        }

        try {
            /** @var User $authUser */
            $authUser = $request->user();

            $teacher = User::create([
                'username'             => $username,
                'email'                => $email ?: null,
                'password'             => $password,
                'role'                 => 'teacher',
                'full_name'            => $fullName ?: $username,
                'created_by'           => $authUser->id,
                'subject_expertise'    => $subjectExpertise ?: null,
                'must_change_password' => true,
            ]);

            $this->availability->ensureDefaultTeacherAvailability($teacher->id);

            return response()->json([
                'message'      => 'Teacher account created',
                'username'     => $username,
                'role'         => 'teacher',
                'tempPassword' => $password,
            ], 201);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error creating teacher', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // DELETE /users/:id  (admin only — cascading cleanup)
    // -----------------------------------------------------------------------

    public function deleteUser(Request $request, int $id): JsonResponse
    {
        try {
            $userId = $id;
            if ($userId < 1) {
                return response()->json(['message' => 'Invalid user id.'], 400);
            }

            /** @var User $authUser */
            $authUser = $request->user();

            if ($authUser->id === $userId) {
                return response()->json(
                    ['message' => 'You cannot delete your own account while logged in.'],
                    400
                );
            }

            $target = User::find($userId);
            if (!$target) {
                return response()->json(['message' => 'User not found.'], 404);
            }

            if ($target->role === 'admin') {
                $adminCount = User::where('role', 'admin')->count();
                if ($adminCount <= 1) {
                    return response()->json(['message' => 'Cannot delete the last admin account.'], 400);
                }
            }

            DB::transaction(function () use ($userId) {
                // Direct user references
                DB::table('notifications')->where('user_id', $userId)->delete();
                DB::table('calendar_events')->where('user_id', $userId)->delete();
                DB::table('calendar_connections')->where('user_id', $userId)->delete();
                DB::table('teacher_availability')->where('teacher_id', $userId)->delete();
                DB::table('payment_receipts')
                    ->where('student_id', $userId)
                    ->orWhere('recorded_by', $userId)
                    ->delete();

                DB::table('student_feedback')
                    ->where('student_id', $userId)
                    ->orWhere('teacher_id', $userId)
                    ->delete();

                DB::table('lesson_reports')
                    ->where('student_id', $userId)
                    ->orWhere('teacher_id', $userId)
                    ->delete();

                // Class-linked records
                $classIds = DB::table('classes')
                    ->where('student_id', $userId)
                    ->orWhere('teacher_id', $userId)
                    ->pluck('id')
                    ->all();

                foreach ($classIds as $classId) {
                    DB::table('calendar_events')->where('class_id', $classId)->delete();
                    DB::table('student_feedback')->where('class_id', $classId)->delete();
                    DB::table('lesson_reports')->where('class_id', $classId)->delete();
                    DB::table('notifications')->where('related_class_id', $classId)->delete();
                }

                // Conversation messages
                $conversationIds = DB::table('conversations')
                    ->where('student_id', $userId)
                    ->orWhere('teacher_id', $userId)
                    ->pluck('id')
                    ->all();

                foreach ($conversationIds as $convId) {
                    DB::table('messages')->where('conversation_id', $convId)->delete();
                }

                DB::table('conversations')
                    ->where('student_id', $userId)
                    ->orWhere('teacher_id', $userId)
                    ->delete();

                DB::table('classes')
                    ->where('student_id', $userId)
                    ->orWhere('teacher_id', $userId)
                    ->delete();

                // Schedule requests and slots
                $requestIds = DB::table('schedule_requests')
                    ->where('student_id', $userId)
                    ->orWhere('assigned_teacher_id', $userId)
                    ->pluck('id')
                    ->all();

                foreach ($requestIds as $reqId) {
                    DB::table('schedule_request_slots')->where('request_id', $reqId)->delete();
                    DB::table('notifications')->where('related_request_id', $reqId)->delete();
                    DB::table('schedule_requests')->where('id', $reqId)->delete();
                }

                DB::table('users')->where('created_by', $userId)->update(['created_by' => null]);
                DB::table('users')->where('id', $userId)->delete();
            });

            $displayName = $target->full_name ?? $target->username;

            return response()->json([
                'message'       => "Deleted {$displayName} (@{$target->username}).",
                'deletedUserId' => $userId,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Unable to delete this user right now.',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }
}
