<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Homework;
use App\Models\HomeworkSubmission;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class HomeworkController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
    ) {}

    private const SUBMISSION_DIR = 'homework-submissions';

    private const BLOCKED_EXTENSIONS = [
        'php', 'phtml', 'phar', 'exe', 'bat', 'cmd', 'com', 'sh', 'ps1', 'js', 'jar', 'msi', 'dll',
    ];

    // -----------------------------------------------------------------------
    // Mapper
    // -----------------------------------------------------------------------

    private function mapHomework(Homework $h): array
    {
        $submission = $h->submission;

        return [
            'id'           => $h->id,
            'title'        => $h->title,
            'instructions' => $h->instructions ?? '',
            'dueAt'        => $h->due_at,
            'maxScore'     => $h->max_score,
            'status'       => $h->status(),
            'courseId'     => $h->course_id,
            'course'       => $h->course ? ['id' => $h->course->id, 'title' => $h->course->title] : null,
            'classId'      => $h->class_id,
            'teacher'      => $h->teacher ? [
                'id'       => $h->teacher->id,
                'fullName' => $h->teacher->full_name ?: $h->teacher->username,
            ] : null,
            'student'      => $h->student ? [
                'id'       => $h->student->id,
                'fullName' => $h->student->full_name ?: $h->student->username,
            ] : null,
            'submission'   => $submission ? [
                'body'         => $submission->body ?? '',
                'fileName'     => $submission->original_name,
                'hasFile'      => (bool) $submission->storage_path,
                'submittedAt'  => $submission->submitted_at,
                'score'        => $submission->score,
                'feedback'     => $submission->feedback ?? '',
                'gradedAt'     => $submission->graded_at,
            ] : null,
            'createdAt'    => $h->created_at,
        ];
    }

    private function isStaff(?User $user): bool
    {
        return in_array($user?->role, ['admin', 'teacher'], true);
    }

    // -----------------------------------------------------------------------
    // GET /homework
    // -----------------------------------------------------------------------

    public function listHomework(Request $request): JsonResponse
    {
        try {
            $user  = $request->user();
            $query = Homework::with(['teacher', 'student', 'course', 'submission'])
                ->orderByRaw('due_at IS NULL')
                ->orderBy('due_at');

            if ($user->role === 'student') {
                $query->where('student_id', $user->id);
            } elseif ($user->role === 'teacher') {
                $query->where('teacher_id', $user->id);
            }

            if ($studentId = $request->query('studentId')) {
                $query->where('student_id', (int) $studentId);
            }

            $items = $query->get();

            // Term average over graded work only, scaled to each max_score so
            // a 10-point quiz and a 100-point paper weigh the same.
            $graded = $items->filter(fn (Homework $h) => $h->submission?->graded_at !== null);
            $average = null;
            if ($graded->isNotEmpty()) {
                $sum = $graded->sum(function (Homework $h) {
                    $max = max(1, $h->max_score);

                    return ($h->submission->score ?? 0) / $max * 100;
                });
                $average = round($sum / $graded->count(), 1);
            }

            return response()->json([
                'homework' => $items->map(fn (Homework $h) => $this->mapHomework($h))->values()->all(),
                'summary'  => [
                    'total'     => $items->count(),
                    'pending'   => $items->filter(fn ($h) => $h->status() === 'pending')->count(),
                    'submitted' => $items->filter(fn ($h) => $h->status() === 'submitted')->count(),
                    'graded'    => $graded->count(),
                    'average'   => $average,
                ],
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to list homework.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /homework   (teacher, admin)
    // -----------------------------------------------------------------------

    public function createHomework(Request $request): JsonResponse
    {
        $data = $request->validate([
            'studentId'      => ['required', 'integer', 'exists:users,id'],
            'title'          => ['required', 'string', 'max:200'],
            'instructions'   => ['nullable', 'string', 'max:5000'],
            'dueAt'          => ['nullable', 'date'],
            'maxScore'       => ['nullable', 'integer', 'min:1', 'max:1000'],
            'classId'        => ['nullable', 'integer', 'exists:classes,id'],
            'courseId'       => ['nullable', 'integer', 'exists:courses,id'],
            'lessonReportId' => ['nullable', 'integer', 'exists:lesson_reports,id'],
        ]);

        $student = User::find($data['studentId']);
        if (! $student || $student->role !== 'student') {
            return response()->json(['message' => 'Homework can only be set for a student.'], 422);
        }

        try {
            $homework = Homework::create([
                'teacher_id'       => $request->user()->id,
                'student_id'       => $student->id,
                'class_id'         => $data['classId']        ?? null,
                'course_id'        => $data['courseId']       ?? null,
                'lesson_report_id' => $data['lessonReportId'] ?? null,
                'title'            => $data['title'],
                'instructions'     => $data['instructions']   ?? null,
                'due_at'           => $data['dueAt']          ?? null,
                'max_score'        => $data['maxScore']       ?? 100,
            ]);

            $homework->load(['teacher', 'student', 'course', 'submission']);

            return response()->json([
                'message'  => 'Homework set.',
                'homework' => $this->mapHomework($homework),
            ], 201);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to set homework.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /homework/{id}/submit   (student)
    // -----------------------------------------------------------------------

    public function submitHomework(Request $request, int $id): JsonResponse
    {
        $homework = Homework::with('submission')->find($id);
        if (! $homework) {
            return response()->json(['message' => 'Homework not found.'], 404);
        }
        if ($homework->student_id !== $request->user()->id) {
            return response()->json(['message' => 'That homework was not set for you.'], 403);
        }
        if ($homework->submission?->graded_at !== null) {
            return response()->json(['message' => 'That homework has already been graded.'], 422);
        }

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:5000'],
            'file' => ['nullable', 'file', 'max:20480'],
        ]);

        if (empty($data['body']) && ! $request->hasFile('file')) {
            return response()->json(['message' => 'Add a note or attach a file.'], 422);
        }

        try {
            $submission = $homework->submission ?? new HomeworkSubmission(['homework_id' => $homework->id]);

            if ($request->hasFile('file')) {
                $file      = $request->file('file');
                $extension = strtolower($file->getClientOriginalExtension());

                if (in_array($extension, self::BLOCKED_EXTENSIONS, true)) {
                    return response()->json(['message' => 'That file type is not allowed.'], 422);
                }

                // Resubmitting replaces the file rather than orphaning it.
                if ($submission->storage_path) {
                    Storage::disk('local')->delete($submission->storage_path);
                }

                $submission->storage_path  = $file->store(self::SUBMISSION_DIR . '/' . $homework->id, 'local');
                $submission->original_name = $file->getClientOriginalName();
            }

            if (array_key_exists('body', $data)) {
                $submission->body = $data['body'];
            }

            $submission->homework_id  = $homework->id;
            $submission->submitted_at = now();
            $submission->save();

            $homework->load(['teacher', 'student', 'course', 'submission']);

            return response()->json([
                'message'  => 'Homework submitted.',
                'homework' => $this->mapHomework($homework),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to submit homework.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /homework/{id}/grade   (teacher, admin)
    // -----------------------------------------------------------------------

    public function gradeHomework(Request $request, int $id): JsonResponse
    {
        $homework = Homework::with('submission')->find($id);
        if (! $homework) {
            return response()->json(['message' => 'Homework not found.'], 404);
        }
        if (! $homework->submission || $homework->submission->submitted_at === null) {
            return response()->json(['message' => 'Nothing has been handed in yet.'], 422);
        }

        $data = $request->validate([
            'score'    => ['required', 'integer', 'min:0'],
            'feedback' => ['nullable', 'string', 'max:2000'],
        ]);

        if ($data['score'] > $homework->max_score) {
            return response()->json([
                'message' => "Score cannot exceed the maximum of {$homework->max_score}.",
            ], 422);
        }

        try {
            $submission            = $homework->submission;
            $submission->score     = $data['score'];
            $submission->feedback  = $data['feedback'] ?? null;
            $submission->graded_at = now();
            $submission->graded_by = $request->user()->id;
            $submission->save();

            $homework->load(['teacher', 'student', 'course', 'submission']);

            $this->audit->record(
                'scheduling',
                'homework.graded',
                "Homework graded — {$homework->title}",
                $request->user(),
                'homework',
                $homework->id,
                ['score' => $data['score'], 'maxScore' => $homework->max_score],
            );

            return response()->json([
                'message'  => 'Homework graded.',
                'homework' => $this->mapHomework($homework),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to grade homework.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /homework/{id}/file
    // -----------------------------------------------------------------------

    public function downloadSubmission(Request $request, int $id): StreamedResponse|JsonResponse
    {
        $homework = Homework::with('submission')->find($id);
        if (! $homework) {
            return response()->json(['message' => 'Homework not found.'], 404);
        }

        $user    = $request->user();
        $allowed = $this->isStaff($user) || $homework->student_id === $user->id;

        if (! $allowed) {
            return response()->json(['message' => 'That homework is not yours.'], 403);
        }

        $submission = $homework->submission;
        if (! $submission?->storage_path || ! Storage::disk('local')->exists($submission->storage_path)) {
            return response()->json(['message' => 'No file was attached.'], 404);
        }

        return Storage::disk('local')->download($submission->storage_path, $submission->original_name);
    }

    // -----------------------------------------------------------------------
    // DELETE /homework/{id}   (teacher, admin)
    // -----------------------------------------------------------------------

    public function deleteHomework(int $id): JsonResponse
    {
        $homework = Homework::with('submission')->find($id);
        if (! $homework) {
            return response()->json(['message' => 'Homework not found.'], 404);
        }

        try {
            // The row cascades; the stored file does not.
            if ($homework->submission?->storage_path) {
                Storage::disk('local')->delete($homework->submission->storage_path);
            }
            $homework->delete();

            return response()->json(['message' => 'Homework removed.']);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to remove homework.', 'error' => $e->getMessage()], 500);
        }
    }
}
