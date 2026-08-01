<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CourseTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, string $username): User
    {
        return User::create([
            'username'  => $username,
            'email'     => $username . '@test.local',
            'password'  => 'secret123',
            'full_name' => ucfirst($username),
            'role'      => $role,
        ]);
    }

    private function makeCourse(?User $teacher = null): Course
    {
        return Course::create([
            'title'      => 'Algebra II',
            'subject'    => 'Math',
            'teacher_id' => $teacher?->id,
            'is_active'  => true,
        ]);
    }

    public function test_admin_can_create_a_course(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->postJson('/api/courses', ['title' => 'Algebra II', 'subject' => 'Math'])
            ->assertCreated()
            ->assertJsonPath('course.title', 'Algebra II')
            ->assertJsonPath('course.materialCount', 0)
            ->assertJsonPath('course.studentCount', 0);

        $this->assertDatabaseHas('courses', ['title' => 'Algebra II']);
    }

    public function test_students_cannot_create_courses(): void
    {
        Sanctum::actingAs($this->makeUser('student', 'student1'));

        $this->postJson('/api/courses', ['title' => 'Sneaky'])->assertForbidden();
    }

    public function test_students_only_see_courses_they_are_enrolled_in(): void
    {
        $enrolled = $this->makeCourse();
        $other    = Course::create(['title' => 'Physics', 'subject' => 'Science', 'is_active' => true]);

        $student = $this->makeUser('student', 'student1');
        $enrolled->students()->attach($student->id);

        Sanctum::actingAs($student);

        $response = $this->getJson('/api/courses')->assertOk();
        $titles   = array_column($response->json('courses'), 'title');

        $this->assertContains('Algebra II', $titles);
        $this->assertNotContains('Physics', $titles);
        $this->assertSame($other->id, $other->id); // keep the unused course meaningful
    }

    public function test_staff_see_every_course(): void
    {
        $this->makeCourse();
        Course::create(['title' => 'Physics', 'subject' => 'Science', 'is_active' => true]);

        Sanctum::actingAs($this->makeUser('teacher', 'teacher1'));

        $this->getJson('/api/courses')->assertOk()->assertJsonCount(2, 'courses');
    }

    public function test_admin_can_upload_material_and_counts_update(): void
    {
        Storage::fake('local');

        $course = $this->makeCourse();
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->post("/api/courses/{$course->id}/materials", [
            'file'   => UploadedFile::fake()->create('worksheet.pdf', 120, 'application/pdf'),
            'title'  => 'Worksheet 4',
            'access' => 'enrolled',
        ])->assertCreated()->assertJsonPath('material.title', 'Worksheet 4');

        $this->getJson('/api/courses')->assertOk()->assertJsonPath('courses.0.materialCount', 1);
    }

    public function test_teacher_cannot_upload_or_download_materials(): void
    {
        Storage::fake('local');

        $course = $this->makeCourse();
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $materialId = $this->post("/api/courses/{$course->id}/materials", [
            'file'   => UploadedFile::fake()->create('worksheet.pdf', 120, 'application/pdf'),
            'title'  => 'Worksheet 4',
            'access' => 'enrolled',
        ])->json('material.id');

        Sanctum::actingAs($this->makeUser('teacher', 'teacher1'));

        $this->post("/api/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->create('sneaky.pdf', 10, 'application/pdf'),
        ])->assertForbidden();

        $this->get("/api/materials/{$materialId}/download")->assertForbidden();
        $this->get("/api/materials/{$materialId}/preview")->assertOk();
        $this->deleteJson("/api/materials/{$materialId}")->assertForbidden();
    }

    public function test_executable_uploads_are_refused(): void
    {
        Storage::fake('local');

        $course = $this->makeCourse();
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->post("/api/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->create('payload.php', 10, 'text/plain'),
        ])->assertStatus(422);

        $this->assertDatabaseCount('course_materials', 0);
    }

    public function test_unenrolled_student_cannot_list_or_download_enrolled_material(): void
    {
        Storage::fake('local');

        $course = $this->makeCourse();
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $materialId = $this->post("/api/courses/{$course->id}/materials", [
            'file'   => UploadedFile::fake()->create('secret.pdf', 10, 'application/pdf'),
            'access' => 'enrolled',
        ])->json('material.id');

        $outsider = $this->makeUser('student', 'outsider');
        Sanctum::actingAs($outsider);

        $this->getJson("/api/courses/{$course->id}/materials")
            ->assertOk()
            ->assertJsonCount(0, 'materials');

        $this->getJson("/api/materials/{$materialId}/download")->assertForbidden();
    }

    public function test_enrolled_student_can_download_three_times_per_page(): void
    {
        Storage::fake('local');

        $course = $this->makeCourse();
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $materialId = $this->post("/api/courses/{$course->id}/materials", [
            'file'   => UploadedFile::fake()->create('sheet.pdf', 10, 'application/pdf'),
            'access' => 'enrolled',
        ])->json('material.id');

        $student = $this->makeUser('student', 'student1');
        $course->students()->attach($student->id);
        Sanctum::actingAs($student);

        $list = $this->getJson("/api/courses/{$course->id}/materials")
            ->assertOk()
            ->assertJsonCount(1, 'materials')
            ->assertJsonPath('materials.0.downloadsRemaining', 3)
            ->assertJsonPath('materials.0.canDownload', true);

        $this->assertSame(3, $list->json('downloadLimit'));

        $this->get("/api/materials/{$materialId}/download?page=1")->assertOk();
        $this->get("/api/materials/{$materialId}/download?page=1")->assertOk();
        $this->get("/api/materials/{$materialId}/download?page=1")->assertOk();
        $this->getJson("/api/materials/{$materialId}/download?page=1")
            ->assertForbidden()
            ->assertJsonPath('downloadsRemaining', 0);

        // Viewing never consumes quota.
        $this->get("/api/materials/{$materialId}/preview")->assertOk();

        // A different page has its own 3 chances.
        $this->get("/api/materials/{$materialId}/download?page=2")->assertOk();

        $this->getJson("/api/courses/{$course->id}/materials?page=1")
            ->assertOk()
            ->assertJsonPath('materials.0.downloadsRemaining', 0)
            ->assertJsonPath('materials.0.canDownload', false);
    }

    public function test_material_marked_all_is_readable_without_enrolment(): void
    {
        Storage::fake('local');

        $course = $this->makeCourse();
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $materialId = $this->post("/api/courses/{$course->id}/materials", [
            'file'   => UploadedFile::fake()->create('open.pdf', 10, 'application/pdf'),
            'access' => 'all',
        ])->json('material.id');

        Sanctum::actingAs($this->makeUser('student', 'outsider'));

        $this->getJson("/api/courses/{$course->id}/materials")->assertOk()->assertJsonCount(1, 'materials');
        $this->get("/api/materials/{$materialId}/download")->assertOk();
    }

    public function test_admin_replaces_the_roster_and_non_students_are_ignored(): void
    {
        $course  = $this->makeCourse();
        $a       = $this->makeUser('student', 'a');
        $b       = $this->makeUser('student', 'b');
        $teacher = $this->makeUser('teacher', 'teacher1');

        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->putJson("/api/courses/{$course->id}/enrolments", ['studentIds' => [$a->id, $teacher->id]])
            ->assertOk()
            ->assertJsonCount(1, 'students');

        // Replacing, not appending.
        $this->putJson("/api/courses/{$course->id}/enrolments", ['studentIds' => [$b->id]])
            ->assertOk()
            ->assertJsonCount(1, 'students')
            ->assertJsonPath('students.0.id', $b->id);
    }

    public function test_deleting_a_course_removes_its_stored_files(): void
    {
        Storage::fake('local');

        $course = $this->makeCourse();
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->post("/api/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->create('doomed.pdf', 10, 'application/pdf'),
        ])->assertCreated();

        $path = \App\Models\CourseMaterial::first()->storage_path;
        Storage::disk('local')->assertExists($path);

        $this->deleteJson("/api/courses/{$course->id}")->assertOk();

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('course_materials', 0);
    }
}
