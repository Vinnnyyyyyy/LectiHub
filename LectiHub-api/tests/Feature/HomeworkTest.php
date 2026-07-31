<?php

namespace Tests\Feature;

use App\Models\Homework;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HomeworkTest extends TestCase
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

    private function setHomework(User $teacher, User $student, array $overrides = []): int
    {
        Sanctum::actingAs($teacher);

        return $this->postJson('/api/homework', array_merge([
            'studentId'    => $student->id,
            'title'        => 'Worksheet 4',
            'instructions' => 'Problems 1-6.',
            'dueAt'        => now()->addDays(3)->toDateTimeString(),
        ], $overrides))->assertCreated()->json('homework.id');
    }

    public function test_teacher_sets_homework_and_it_starts_pending(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');

        $id = $this->setHomework($teacher, $student);

        $this->assertDatabaseHas('homework', ['id' => $id, 'title' => 'Worksheet 4']);

        Sanctum::actingAs($student);
        $this->getJson('/api/homework')
            ->assertOk()
            ->assertJsonCount(1, 'homework')
            ->assertJsonPath('homework.0.status', 'pending')
            ->assertJsonPath('summary.pending', 1);
    }

    public function test_homework_can_only_be_set_for_a_student(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $other   = $this->makeUser('teacher', 't2');

        Sanctum::actingAs($teacher);
        $this->postJson('/api/homework', ['studentId' => $other->id, 'title' => 'Nope'])
            ->assertStatus(422);
    }

    public function test_students_only_see_their_own_and_teachers_only_what_they_set(): void
    {
        $t1 = $this->makeUser('teacher', 't1');
        $t2 = $this->makeUser('teacher', 't2');
        $s1 = $this->makeUser('student', 's1');
        $s2 = $this->makeUser('student', 's2');

        $this->setHomework($t1, $s1, ['title' => 'For s1']);
        $this->setHomework($t2, $s2, ['title' => 'For s2']);

        Sanctum::actingAs($s1);
        $this->getJson('/api/homework')->assertOk()->assertJsonCount(1, 'homework')
            ->assertJsonPath('homework.0.title', 'For s1');

        Sanctum::actingAs($t2);
        $this->getJson('/api/homework')->assertOk()->assertJsonCount(1, 'homework')
            ->assertJsonPath('homework.0.title', 'For s2');

        // Admin sees everything.
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $this->getJson('/api/homework')->assertOk()->assertJsonCount(2, 'homework');
    }

    public function test_student_submits_and_status_moves_to_submitted(): void
    {
        Storage::fake('local');
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->post("/api/homework/{$id}/submit", [
            'body' => 'Done, question 4 was hard.',
            'file' => UploadedFile::fake()->create('work.pdf', 20, 'application/pdf'),
        ])->assertOk()->assertJsonPath('homework.status', 'submitted');

        $this->getJson('/api/homework')->assertJsonPath('summary.submitted', 1);
    }

    public function test_a_submission_needs_a_note_or_a_file(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->postJson("/api/homework/{$id}/submit", [])->assertStatus(422);
    }

    public function test_a_student_cannot_submit_someone_elses_homework(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($this->makeUser('student', 'intruder'));
        $this->postJson("/api/homework/{$id}/submit", ['body' => 'Mine now'])->assertForbidden();
    }

    public function test_executable_submissions_are_refused(): void
    {
        Storage::fake('local');
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->post("/api/homework/{$id}/submit", [
            'file' => UploadedFile::fake()->create('payload.php', 5, 'text/plain'),
        ])->assertStatus(422);
    }

    public function test_resubmitting_replaces_the_file_rather_than_orphaning_it(): void
    {
        Storage::fake('local');
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->post("/api/homework/{$id}/submit", [
            'file' => UploadedFile::fake()->create('first.pdf', 10, 'application/pdf'),
        ])->assertOk();

        $first = Homework::find($id)->submission->storage_path;
        Storage::disk('local')->assertExists($first);

        $this->post("/api/homework/{$id}/submit", [
            'file' => UploadedFile::fake()->create('second.pdf', 10, 'application/pdf'),
        ])->assertOk();

        $second = Homework::find($id)->fresh()->submission->storage_path;

        Storage::disk('local')->assertMissing($first);
        Storage::disk('local')->assertExists($second);
        // Still one submission row, not two.
        $this->assertDatabaseCount('homework_submissions', 1);
    }

    public function test_teacher_grades_and_the_average_is_scaled_to_max_score(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');

        // 8/10 and 90/100 — both 80% and 90%, so the average is 85, not 49.
        $a = $this->setHomework($teacher, $student, ['title' => 'Quiz', 'maxScore' => 10]);
        $b = $this->setHomework($teacher, $student, ['title' => 'Paper', 'maxScore' => 100]);

        Sanctum::actingAs($student);
        $this->postJson("/api/homework/{$a}/submit", ['body' => 'done'])->assertOk();
        $this->postJson("/api/homework/{$b}/submit", ['body' => 'done'])->assertOk();

        Sanctum::actingAs($teacher);
        $this->postJson("/api/homework/{$a}/grade", ['score' => 8, 'feedback' => 'Good.'])->assertOk();
        $this->postJson("/api/homework/{$b}/grade", ['score' => 90])->assertOk();

        // A whole average encodes as 85, a fractional one as 85.5 — compare
        // numerically rather than pinning the JSON type.
        $summary = $this->getJson('/api/homework')->assertOk()->json('summary');

        $this->assertSame(2, $summary['graded']);
        $this->assertEqualsWithDelta(85, $summary['average'], 0.001);
    }

    public function test_grading_requires_a_submission_and_respects_the_maximum(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student, ['maxScore' => 10]);

        Sanctum::actingAs($teacher);
        $this->postJson("/api/homework/{$id}/grade", ['score' => 5])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Nothing has been handed in yet.');

        Sanctum::actingAs($student);
        $this->postJson("/api/homework/{$id}/submit", ['body' => 'done'])->assertOk();

        Sanctum::actingAs($teacher);
        $this->postJson("/api/homework/{$id}/grade", ['score' => 50])->assertStatus(422);
        $this->postJson("/api/homework/{$id}/grade", ['score' => 9])->assertOk();
    }

    public function test_a_graded_piece_cannot_be_resubmitted(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->postJson("/api/homework/{$id}/submit", ['body' => 'first'])->assertOk();

        Sanctum::actingAs($teacher);
        $this->postJson("/api/homework/{$id}/grade", ['score' => 70])->assertOk();

        Sanctum::actingAs($student);
        $this->postJson("/api/homework/{$id}/submit", ['body' => 'sneaky edit'])->assertStatus(422);
    }

    public function test_only_the_owner_or_staff_can_download_a_submission(): void
    {
        Storage::fake('local');
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->post("/api/homework/{$id}/submit", [
            'file' => UploadedFile::fake()->create('work.pdf', 10, 'application/pdf'),
        ])->assertOk();

        $this->get("/api/homework/{$id}/file")->assertOk();

        Sanctum::actingAs($teacher);
        $this->get("/api/homework/{$id}/file")->assertOk();

        Sanctum::actingAs($this->makeUser('student', 'intruder'));
        $this->getJson("/api/homework/{$id}/file")->assertForbidden();
    }

    public function test_deleting_homework_removes_the_submitted_file(): void
    {
        Storage::fake('local');
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->post("/api/homework/{$id}/submit", [
            'file' => UploadedFile::fake()->create('work.pdf', 10, 'application/pdf'),
        ])->assertOk();

        $path = Homework::find($id)->submission->storage_path;

        Sanctum::actingAs($teacher);
        $this->deleteJson("/api/homework/{$id}")->assertOk();

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('homework', 0);
        $this->assertDatabaseCount('homework_submissions', 0);
    }

    public function test_students_cannot_set_or_grade_homework(): void
    {
        $teacher = $this->makeUser('teacher', 't1');
        $student = $this->makeUser('student', 's1');
        $id      = $this->setHomework($teacher, $student);

        Sanctum::actingAs($student);
        $this->postJson('/api/homework', ['studentId' => $student->id, 'title' => 'Self-set'])
            ->assertForbidden();
        $this->postJson("/api/homework/{$id}/grade", ['score' => 100])->assertForbidden();
    }
}
