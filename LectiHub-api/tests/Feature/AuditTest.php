<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Course;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditTest extends TestCase
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

    public function test_creating_a_teacher_is_logged(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->postJson('/api/users/create', [
            'username'          => 'newteacher',
            'password'          => 'secret123',
            'full_name'         => 'New Teacher',
            'subject_expertise' => 'Math',
        ])->assertCreated();

        $this->assertDatabaseHas('audit_events', [
            'category' => 'accounts',
            'action'   => 'teacher.created',
        ]);

        $event = AuditEvent::first();
        $this->assertSame('Admin1', $event->actor_name);
        $this->assertStringContainsString('New Teacher', $event->description);
    }

    public function test_deleting_a_user_is_logged_and_survives_the_deletion(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $victim = $this->makeUser('student', 'victim');

        $this->deleteJson("/api/users/{$victim->id}")->assertOk();

        $event = AuditEvent::where('action', 'user.deleted')->first();
        $this->assertNotNull($event);
        $this->assertStringContainsString('victim', $event->description);
        // The row is gone but the log still names who it was.
        $this->assertDatabaseMissing('users', ['id' => $victim->id]);
        $this->assertSame('Admin1', $event->actor_name);
    }

    public function test_uploading_material_is_logged(): void
    {
        Storage::fake('local');

        $course = Course::create(['title' => 'Algebra II', 'subject' => 'Math', 'is_active' => true]);
        Sanctum::actingAs($this->makeUser('teacher', 'teacher1'));

        $this->post("/api/courses/{$course->id}/materials", [
            'file'  => UploadedFile::fake()->create('worksheet.pdf', 10, 'application/pdf'),
            'title' => 'Worksheet 4',
        ])->assertCreated();

        $event = AuditEvent::where('category', 'materials')->first();
        $this->assertNotNull($event);
        $this->assertStringContainsString('Worksheet 4', $event->description);
        $this->assertSame('Algebra II', $event->metadata['course']);
    }

    public function test_sending_an_announcement_is_logged_with_reach(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $this->makeUser('student', 's1');
        $this->makeUser('student', 's2');

        $this->postJson('/api/announcements', [
            'subject'      => 'Closure',
            'body'         => 'Closed Monday.',
            'audienceType' => 'students',
            'send'         => true,
        ])->assertCreated();

        $event = AuditEvent::where('category', 'announcements')->first();
        $this->assertNotNull($event);
        $this->assertSame(2, $event->metadata['recipients']);
        $this->assertSame('students', $event->metadata['audience']);
    }

    public function test_admin_can_read_the_log_and_filter_it(): void
    {
        $admin = $this->makeUser('admin', 'admin1');
        $audit = app(AuditService::class);

        $audit->record('scheduling', 'class.started', 'Class #1 moved to in progress');
        $audit->record('accounts', 'teacher.created', 'Teacher account created — Ava', $admin);
        $audit->record('materials', 'material.uploaded', 'Material uploaded — Worksheet 4', $admin);

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/audit')
            ->assertOk()
            ->assertJsonCount(3, 'events')
            ->assertJsonPath('counts.total', 3);

        $this->getJson('/api/admin/audit?category=accounts')
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.action', 'teacher.created');

        $this->getJson('/api/admin/audit?search=Worksheet')
            ->assertOk()
            ->assertJsonCount(1, 'events');

        $this->getJson('/api/admin/audit?actor=Admin1')
            ->assertOk()
            ->assertJsonCount(2, 'events');
    }

    public function test_system_events_have_no_actor_but_still_read(): void
    {
        app(AuditService::class)->record('scheduling', 'class.started', 'Class #1 started');

        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->getJson('/api/admin/audit')
            ->assertOk()
            ->assertJsonPath('events.0.actorName', 'System')
            ->assertJsonPath('events.0.actorId', null);
    }

    public function test_the_log_is_newest_first_and_capped(): void
    {
        $audit = app(AuditService::class);
        for ($i = 1; $i <= 5; $i++) {
            $audit->record('scheduling', "event.{$i}", "Event {$i}");
        }

        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->getJson('/api/admin/audit?limit=2')->assertOk()->assertJsonCount(2, 'events');

        // Over the cap falls back to 500 rather than returning everything.
        $this->getJson('/api/admin/audit?limit=99999')->assertOk()->assertJsonCount(5, 'events');
    }

    public function test_non_admins_cannot_read_the_log(): void
    {
        Sanctum::actingAs($this->makeUser('teacher', 'teacher1'));
        $this->getJson('/api/admin/audit')->assertForbidden();

        Sanctum::actingAs($this->makeUser('student', 'student1'));
        $this->getJson('/api/admin/audit')->assertForbidden();
    }

    public function test_a_failed_audit_write_does_not_break_the_request(): void
    {
        // Dropping the table makes every insert throw; the upload must still work.
        Storage::fake('local');
        $course = Course::create(['title' => 'Algebra II', 'is_active' => true]);
        \Illuminate\Support\Facades\Schema::drop('audit_events');

        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->post("/api/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->create('still-works.pdf', 10, 'application/pdf'),
        ])->assertCreated();

        $this->assertDatabaseCount('course_materials', 1);
    }
}
