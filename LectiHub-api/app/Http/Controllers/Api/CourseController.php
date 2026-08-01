<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseMaterial;
use App\Models\MaterialPageDownload;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class CourseController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
    ) {}

    private const ACCESS = ['enrolled', 'all'];

    /** Where uploaded material lives, relative to the private disk. */
    private const MATERIAL_DIR = 'course-materials';

    /** Students may download each material page this many times. */
    public const DOWNLOADS_PER_PAGE = 3;

    /** Anything executable is refused regardless of the reported MIME type. */
    private const BLOCKED_EXTENSIONS = [
        'php', 'phtml', 'phar', 'exe', 'bat', 'cmd', 'com', 'sh', 'ps1', 'js', 'jar', 'msi', 'dll',
    ];

    // -----------------------------------------------------------------------
    // Mappers
    // -----------------------------------------------------------------------

    private function mapCourse(Course $course, ?int $materialCount = null, ?int $studentCount = null): array
    {
        $teacher = $course->teacher;

        return [
            'id'            => $course->id,
            'title'         => $course->title,
            'subject'       => $course->subject ?? '',
            'description'   => $course->description ?? '',
            'isActive'      => (bool) $course->is_active,
            'teacherId'     => $course->teacher_id,
            'teacher'       => $teacher ? [
                'id'       => $teacher->id,
                'username' => $teacher->username,
                'fullName' => $teacher->full_name ?: $teacher->username,
                'email'    => $teacher->email ?? '',
            ] : null,
            'materialCount' => $materialCount ?? $course->materials_count ?? 0,
            'studentCount'  => $studentCount ?? $course->students_count ?? 0,
            'createdAt'     => $course->created_at,
        ];
    }

    private function mapMaterial(CourseMaterial $material, ?User $viewer = null, int $page = 1): array
    {
        $uploader = $material->uploader;
        $page     = max(1, $page);

        $payload = [
            'id'            => $material->id,
            'courseId'      => $material->course_id,
            'title'         => $material->title,
            'originalName'  => $material->original_name,
            'mimeType'      => $material->mime_type ?? '',
            'sizeBytes'     => (int) $material->size_bytes,
            'access'        => $material->access,
            'pageNumber'    => $page,
            'downloadLimit' => self::DOWNLOADS_PER_PAGE,
            'uploadedBy'    => $uploader ? [
                'id'       => $uploader->id,
                'fullName' => $uploader->full_name ?: $uploader->username,
            ] : null,
            'createdAt'     => $material->created_at,
        ];

        if ($viewer?->role === 'student') {
            $used = (int) MaterialPageDownload::query()
                ->where('material_id', $material->id)
                ->where('student_id', $viewer->id)
                ->where('page_number', $page)
                ->value('download_count');

            $payload['downloadsUsed']      = $used;
            $payload['downloadsRemaining'] = max(0, self::DOWNLOADS_PER_PAGE - $used);
            $payload['canDownload']        = $used < self::DOWNLOADS_PER_PAGE;
        } else {
            // Admin may download freely; teachers are view-only.
            $payload['downloadsUsed']      = 0;
            $payload['downloadsRemaining'] = null;
            $payload['canDownload']        = $viewer?->role === 'admin';
        }

        return $payload;
    }

    private function canAccessMaterial(?User $user, CourseMaterial $material): bool
    {
        if ($this->isStaff($user)) {
            return true;
        }

        if ($material->access === 'all') {
            return $user !== null;
        }

        return $user !== null && $this->isEnrolled($material->course_id, $user->id);
    }

    // -----------------------------------------------------------------------
    // Access
    // -----------------------------------------------------------------------

    private function isStaff(?User $user): bool
    {
        return in_array($user?->role, ['admin', 'teacher'], true);
    }

    private function isEnrolled(int $courseId, int $studentId): bool
    {
        return DB::table('course_enrolments')
            ->where('course_id', $courseId)
            ->where('student_id', $studentId)
            ->exists();
    }

    /** Students only see courses they are enrolled in. Staff see everything. */
    private function canSeeCourse(?User $user, Course $course): bool
    {
        if ($this->isStaff($user)) {
            return true;
        }

        return $user !== null && $this->isEnrolled($course->id, $user->id);
    }

    // -----------------------------------------------------------------------
    // GET /courses
    // -----------------------------------------------------------------------

    public function listCourses(Request $request): JsonResponse
    {
        try {
            $user = $request->user();

            $query = Course::query()
                ->withCount(['materials', 'students'])
                ->with('teacher')
                ->orderBy('subject')
                ->orderBy('title');

            if (! $this->isStaff($user)) {
                $query->whereIn('id', function ($sub) use ($user) {
                    $sub->select('course_id')
                        ->from('course_enrolments')
                        ->where('student_id', $user->id);
                });
            }

            $courses = $query->get();

            return response()->json([
                'courses' => $courses->map(fn (Course $c) => $this->mapCourse($c))->all(),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to list courses.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /courses   (admin)
    // -----------------------------------------------------------------------

    public function createCourse(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'       => ['required', 'string', 'max:200'],
            'subject'     => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:2000'],
            'teacherId'   => ['nullable', 'integer', 'exists:users,id'],
        ]);

        try {
            $course = Course::create([
                'title'       => $data['title'],
                'subject'     => $data['subject']     ?? null,
                'description' => $data['description'] ?? null,
                'teacher_id'  => $data['teacherId']   ?? null,
                'is_active'   => true,
            ]);

            $course->load('teacher');

            return response()->json([
                'message' => 'Course created.',
                'course'  => $this->mapCourse($course, 0, 0),
            ], 201);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to create course.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // PATCH /courses/{id}   (admin)
    // -----------------------------------------------------------------------

    public function updateCourse(Request $request, int $id): JsonResponse
    {
        $course = Course::find($id);
        if (! $course) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $data = $request->validate([
            'title'       => ['sometimes', 'string', 'max:200'],
            'subject'     => ['sometimes', 'nullable', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'teacherId'   => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'isActive'    => ['sometimes', 'boolean'],
        ]);

        try {
            if (array_key_exists('title', $data))       $course->title       = $data['title'];
            if (array_key_exists('subject', $data))     $course->subject     = $data['subject'];
            if (array_key_exists('description', $data)) $course->description = $data['description'];
            if (array_key_exists('teacherId', $data))   $course->teacher_id  = $data['teacherId'];
            if (array_key_exists('isActive', $data))    $course->is_active   = $data['isActive'];
            $course->save();

            $course->load('teacher')->loadCount(['materials', 'students']);

            return response()->json(['message' => 'Course updated.', 'course' => $this->mapCourse($course)]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to update course.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // DELETE /courses/{id}   (admin)
    // -----------------------------------------------------------------------

    public function deleteCourse(int $id): JsonResponse
    {
        $course = Course::with('materials')->find($id);
        if (! $course) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        try {
            // Rows cascade, but the stored files do not — remove them first.
            foreach ($course->materials as $material) {
                Storage::disk('local')->delete($material->storage_path);
            }
            $course->delete();

            return response()->json(['message' => 'Course deleted.']);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to delete course.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /courses/{id}/materials
    // -----------------------------------------------------------------------

    public function listMaterials(Request $request, int $id): JsonResponse
    {
        $course = Course::find($id);
        if (! $course) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $user = $request->user();

        try {
            $query = CourseMaterial::where('course_id', $id)->with('uploader')->latest();

            // A student not enrolled still sees anything marked open to all.
            if (! $this->isStaff($user) && ! $this->isEnrolled($id, $user->id)) {
                $query->where('access', 'all');
            }

            $page = max(1, (int) $request->query('page', 1));

            return response()->json([
                'downloadLimit' => self::DOWNLOADS_PER_PAGE,
                'materials'     => $query->get()
                    ->map(fn ($m) => $this->mapMaterial($m, $user, $page))
                    ->all(),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to list materials.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /courses/{id}/materials   (admin)  — multipart
    // -----------------------------------------------------------------------

    public function uploadMaterial(Request $request, int $id): JsonResponse
    {
        $course = Course::find($id);
        if (! $course) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $data = $request->validate([
            'file'   => ['required', 'file', 'max:20480'], // 20 MB
            'title'  => ['nullable', 'string', 'max:200'],
            'access' => ['nullable', 'string'],
        ]);

        $file      = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension());

        if (in_array($extension, self::BLOCKED_EXTENSIONS, true)) {
            return response()->json(['message' => 'That file type is not allowed.'], 422);
        }

        $access = in_array($data['access'] ?? '', self::ACCESS, true) ? $data['access'] : 'enrolled';

        try {
            // Stored outside the public disk; downloads go through the route
            // below so access can be checked per request.
            $path = $file->store(self::MATERIAL_DIR . '/' . $course->id, 'local');

            $material = CourseMaterial::create([
                'course_id'     => $course->id,
                'uploaded_by'   => $request->user()?->id,
                'title'         => ($data['title'] ?? null) ?: $file->getClientOriginalName(),
                'original_name' => $file->getClientOriginalName(),
                'storage_path'  => $path,
                'mime_type'     => $file->getClientMimeType(),
                'size_bytes'    => $file->getSize(),
                'access'        => $access,
            ]);

            $material->load('uploader');

            $this->audit->record(
                'materials',
                'material.uploaded',
                "Material uploaded — {$material->title}",
                $request->user(),
                'course_material',
                $material->id,
                ['course' => $course->title, 'access' => $material->access],
            );

            return response()->json([
                'message'  => 'Material uploaded.',
                'material' => $this->mapMaterial($material, $request->user()),
            ], 201);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to upload material.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /materials/{id}/preview   — in-browser view (no quota)
    // -----------------------------------------------------------------------

    public function previewMaterial(Request $request, int $id): StreamedResponse|JsonResponse
    {
        $material = CourseMaterial::with('course')->find($id);
        if (! $material) {
            return response()->json(['message' => 'Material not found.'], 404);
        }

        $user = $request->user();
        if (! $this->canAccessMaterial($user, $material)) {
            return response()->json(['message' => 'You are not enrolled in this course.'], 403);
        }

        if (! Storage::disk('local')->exists($material->storage_path)) {
            return response()->json(['message' => 'The stored file is missing.'], 410);
        }

        return Storage::disk('local')->response(
            $material->storage_path,
            $material->original_name,
            [
                'Content-Type'        => $material->mime_type ?: 'application/octet-stream',
                'Content-Disposition' => 'inline; filename="' . addslashes($material->original_name) . '"',
            ],
        );
    }

    // -----------------------------------------------------------------------
    // GET /materials/{id}/download   — students: 3 per page; admin: unlimited
    // -----------------------------------------------------------------------

    public function downloadMaterial(Request $request, int $id): StreamedResponse|JsonResponse
    {
        $material = CourseMaterial::with('course')->find($id);
        if (! $material) {
            return response()->json(['message' => 'Material not found.'], 404);
        }

        $user = $request->user();
        if (! $this->canAccessMaterial($user, $material)) {
            return response()->json(['message' => 'You are not enrolled in this course.'], 403);
        }

        // Teachers discuss from the preview; downloads are for students (and admin).
        if ($user?->role === 'teacher') {
            return response()->json([
                'message' => 'Teachers can view materials for discussion but cannot download them.',
            ], 403);
        }

        if (! Storage::disk('local')->exists($material->storage_path)) {
            return response()->json(['message' => 'The stored file is missing.'], 410);
        }

        $page = max(1, (int) $request->query('page', 1));

        if ($user?->role === 'student') {
            $quota = MaterialPageDownload::query()->firstOrCreate(
                [
                    'material_id' => $material->id,
                    'student_id'  => $user->id,
                    'page_number' => $page,
                ],
                ['download_count' => 0],
            );

            if ($quota->download_count >= self::DOWNLOADS_PER_PAGE) {
                return response()->json([
                    'message'            => 'Download limit reached for this page (3 chances). You can still view the material online.',
                    'downloadsUsed'      => $quota->download_count,
                    'downloadsRemaining' => 0,
                    'downloadLimit'      => self::DOWNLOADS_PER_PAGE,
                    'pageNumber'         => $page,
                ], 403);
            }

            $quota->download_count += 1;
            $quota->save();
        }

        return Storage::disk('local')->download($material->storage_path, $material->original_name);
    }

    // -----------------------------------------------------------------------
    // DELETE /materials/{id}   (admin)
    // -----------------------------------------------------------------------

    public function deleteMaterial(int $id): JsonResponse
    {
        $material = CourseMaterial::find($id);
        if (! $material) {
            return response()->json(['message' => 'Material not found.'], 404);
        }

        try {
            Storage::disk('local')->delete($material->storage_path);
            $material->delete();

            return response()->json(['message' => 'Material deleted.']);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to delete material.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET / PUT /courses/{id}/enrolments   (admin)
    // -----------------------------------------------------------------------

    public function listEnrolments(int $id): JsonResponse
    {
        $course = Course::with('students')->find($id);
        if (! $course) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        return response()->json([
            'students' => $course->students->map(fn (User $s) => [
                'id'       => $s->id,
                'username' => $s->username,
                'fullName' => $s->full_name ?: $s->username,
                'email'    => $s->email ?? '',
            ])->all(),
        ]);
    }

    /** Replaces the roster wholesale — the screen edits it as a set. */
    public function updateEnrolments(Request $request, int $id): JsonResponse
    {
        $course = Course::find($id);
        if (! $course) {
            return response()->json(['message' => 'Course not found.'], 404);
        }

        $data = $request->validate([
            'studentIds'   => ['present', 'array'],
            'studentIds.*' => ['integer', 'exists:users,id'],
        ]);

        try {
            $studentIds = User::whereIn('id', $data['studentIds'])
                ->where('role', 'student')
                ->pluck('id')
                ->all();

            $course->students()->sync($studentIds);
            $course->load('students');

            return response()->json([
                'message'  => 'Enrolments updated.',
                'students' => $course->students->map(fn (User $s) => [
                    'id'       => $s->id,
                    'username' => $s->username,
                    'fullName' => $s->full_name ?: $s->username,
                    'email'    => $s->email ?? '',
                ])->all(),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to update enrolments.', 'error' => $e->getMessage()], 500);
        }
    }
}
