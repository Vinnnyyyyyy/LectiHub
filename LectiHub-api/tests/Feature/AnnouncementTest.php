<?php

namespace Tests\Feature;

use App\Models\Announcement;
use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AnnouncementTest extends TestCase
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

    public function test_sending_to_students_reaches_only_students(): void
    {
        $admin   = $this->makeUser('admin', 'admin1');
        $s1      = $this->makeUser('student', 's1');
        $s2      = $this->makeUser('student', 's2');
        $teacher = $this->makeUser('teacher', 't1');

        Sanctum::actingAs($admin);

        $this->postJson('/api/announcements', [
            'subject'      => 'Closure',
            'body'         => 'Closed Monday.',
            'audienceType' => 'students',
            'send'         => true,
        ])->assertCreated()->assertJsonPath('announcement.status', 'sent');

        $this->assertDatabaseCount('announcement_recipients', 2);
        $this->assertDatabaseHas('announcement_recipients', ['user_id' => $s1->id]);
        $this->assertDatabaseHas('announcement_recipients', ['user_id' => $s2->id]);
        $this->assertDatabaseMissing('announcement_recipients', ['user_id' => $teacher->id]);
        $this->assertDatabaseMissing('announcement_recipients', ['user_id' => $admin->id]);
    }

    public function test_everyone_excludes_the_author_and_other_admins(): void
    {
        $admin = $this->makeUser('admin', 'admin1');
        $this->makeUser('admin', 'admin2');
        $this->makeUser('student', 's1');
        $this->makeUser('teacher', 't1');

        Sanctum::actingAs($admin);

        $this->postJson('/api/announcements', [
            'subject'      => 'All hands',
            'body'         => 'Hello.',
            'audienceType' => 'everyone',
            'send'         => true,
        ])->assertCreated();

        // 'everyone' means students + teachers, not other admins.
        $this->assertDatabaseCount('announcement_recipients', 2);
    }

    public function test_course_audience_reaches_only_enrolled_students(): void
    {
        $admin  = $this->makeUser('admin', 'admin1');
        $in     = $this->makeUser('student', 'inside');
        $out    = $this->makeUser('student', 'outside');
        $course = Course::create(['title' => 'Algebra II', 'subject' => 'Math', 'is_active' => true]);
        $course->students()->attach($in->id);

        Sanctum::actingAs($admin);

        $this->postJson('/api/announcements', [
            'subject'      => 'Course note',
            'body'         => 'Bring the worksheet.',
            'audienceType' => 'course',
            'courseId'     => $course->id,
            'send'         => true,
        ])->assertCreated();

        $this->assertDatabaseHas('announcement_recipients', ['user_id' => $in->id]);
        $this->assertDatabaseMissing('announcement_recipients', ['user_id' => $out->id]);
    }

    public function test_course_audience_requires_a_course(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->postJson('/api/announcements', [
            'subject'      => 'Oops',
            'body'         => 'No course picked.',
            'audienceType' => 'course',
            'send'         => true,
        ])->assertStatus(422);
    }

    public function test_specific_people_audience_uses_the_target_list(): void
    {
        $admin  = $this->makeUser('admin', 'admin1');
        $picked = $this->makeUser('student', 'picked');
        $other  = $this->makeUser('student', 'other');

        Sanctum::actingAs($admin);

        $this->postJson('/api/announcements', [
            'subject'      => 'Just you',
            'body'         => 'A word.',
            'audienceType' => 'people',
            'userIds'      => [$picked->id],
            'send'         => true,
        ])->assertCreated();

        $this->assertDatabaseHas('announcement_recipients', ['user_id' => $picked->id]);
        $this->assertDatabaseMissing('announcement_recipients', ['user_id' => $other->id]);
    }

    public function test_saving_without_send_creates_a_draft_with_no_recipients(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $this->makeUser('student', 's1');

        $this->postJson('/api/announcements', [
            'subject'      => 'Later',
            'body'         => 'Not yet.',
            'audienceType' => 'students',
        ])->assertCreated()->assertJsonPath('announcement.status', 'draft');

        $this->assertDatabaseCount('announcement_recipients', 0);
    }

    public function test_a_scheduled_date_holds_it_back_even_when_send_is_true(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $this->makeUser('student', 's1');

        $this->postJson('/api/announcements', [
            'subject'      => 'Term 2',
            'body'         => 'Opens soon.',
            'audienceType' => 'students',
            'scheduledFor' => now()->addDays(3)->toDateTimeString(),
            'send'         => true,
        ])->assertCreated()->assertJsonPath('announcement.status', 'scheduled');

        $this->assertDatabaseCount('announcement_recipients', 0);
    }

    public function test_resending_does_not_duplicate_recipients(): void
    {
        $admin = $this->makeUser('admin', 'admin1');
        $this->makeUser('student', 's1');
        Sanctum::actingAs($admin);

        $id = $this->postJson('/api/announcements', [
            'subject'      => 'Draft',
            'body'         => 'Body.',
            'audienceType' => 'students',
        ])->json('announcement.id');

        $this->postJson("/api/announcements/{$id}/send")->assertOk();
        $this->assertDatabaseCount('announcement_recipients', 1);

        // Already sent — refused, and the count holds.
        $this->postJson("/api/announcements/{$id}/send")->assertStatus(422);
        $this->assertDatabaseCount('announcement_recipients', 1);
    }

    public function test_recipients_see_it_and_can_mark_it_read(): void
    {
        $admin   = $this->makeUser('admin', 'admin1');
        $student = $this->makeUser('student', 's1');

        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/announcements', [
            'subject'      => 'Notice',
            'body'         => 'Please read.',
            'audienceType' => 'students',
            'send'         => true,
        ])->json('announcement.id');

        Sanctum::actingAs($student);

        $this->getJson('/api/announcements/mine')
            ->assertOk()
            ->assertJsonCount(1, 'announcements')
            ->assertJsonPath('announcements.0.isRead', false);

        $this->patchJson("/api/announcements/{$id}/read")->assertOk();

        $this->getJson('/api/announcements/mine')->assertJsonPath('announcements.0.isRead', true);

        // The admin list reflects the read back.
        Sanctum::actingAs($admin);
        $this->getJson('/api/announcements')->assertOk()->assertJsonPath('announcements.0.readCount', 1);
    }

    public function test_a_non_recipient_cannot_mark_read(): void
    {
        $admin = $this->makeUser('admin', 'admin1');
        $this->makeUser('student', 's1');

        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/announcements', [
            'subject'      => 'Students only',
            'body'         => 'Body.',
            'audienceType' => 'students',
            'send'         => true,
        ])->json('announcement.id');

        Sanctum::actingAs($this->makeUser('teacher', 't1'));
        $this->patchJson("/api/announcements/{$id}/read")->assertNotFound();
    }

    public function test_sent_announcements_cannot_be_edited(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $this->makeUser('student', 's1');

        $id = $this->postJson('/api/announcements', [
            'subject'      => 'Final',
            'body'         => 'Body.',
            'audienceType' => 'students',
            'send'         => true,
        ])->json('announcement.id');

        $this->patchJson("/api/announcements/{$id}", ['subject' => 'Changed'])->assertStatus(422);
    }

    public function test_students_cannot_reach_the_admin_list_or_compose(): void
    {
        Sanctum::actingAs($this->makeUser('student', 's1'));

        $this->getJson('/api/announcements')->assertForbidden();
        $this->postJson('/api/announcements', [
            'subject'      => 'Nope',
            'body'         => 'Nope.',
            'audienceType' => 'everyone',
        ])->assertForbidden();
    }

    public function test_audience_preview_counts_without_sending(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $this->makeUser('student', 's1');
        $this->makeUser('student', 's2');
        $this->makeUser('teacher', 't1');

        $this->postJson('/api/announcements/preview', ['audienceType' => 'students'])
            ->assertOk()
            ->assertJsonPath('count', 2);

        $this->postJson('/api/announcements/preview', ['audienceType' => 'everyone'])
            ->assertOk()
            ->assertJsonPath('count', 3);

        $this->assertDatabaseCount('announcements', 0);
    }

    public function test_deleting_an_announcement_removes_its_recipients(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $this->makeUser('student', 's1');

        $id = $this->postJson('/api/announcements', [
            'subject'      => 'Doomed',
            'body'         => 'Body.',
            'audienceType' => 'students',
            'send'         => true,
        ])->json('announcement.id');

        $this->assertDatabaseCount('announcement_recipients', 1);

        $this->deleteJson("/api/announcements/{$id}")->assertOk();

        $this->assertDatabaseCount('announcements', 0);
        $this->assertDatabaseCount('announcement_recipients', 0);
        $this->assertSame(0, Announcement::count());
    }
}
