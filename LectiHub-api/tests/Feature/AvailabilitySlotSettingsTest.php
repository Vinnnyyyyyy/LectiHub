<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\AvailabilityService;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AvailabilitySlotSettingsTest extends TestCase
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

    public function test_standard_time_slots_follow_sixty_minute_setting(): void
    {
        app(SettingsService::class)->setMany(['scheduling.slot_minutes' => 60]);

        $slots = app(AvailabilityService::class)->standardTimeSlots();

        $this->assertSame(
            [
                '09:00-10:00', '10:00-11:00', '11:00-12:00',
                '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00',
            ],
            $slots
        );
    }

    public function test_open_availability_returns_configured_slot_grid(): void
    {
        Sanctum::actingAs($this->makeUser('student', 'student1'));
        $this->makeUser('teacher', 'teacher1');

        app(SettingsService::class)->setMany(['scheduling.slot_minutes' => 60]);
        app(AvailabilityService::class)->seedAllTeachers();

        $payload = $this->getJson('/api/availability/open')->assertOk()->json();

        $this->assertContains('09:00-10:00', $payload['timeSlots']);
        $this->assertNotContains('09:00-09:30', $payload['timeSlots']);
        $this->assertNotContains('09:30-10:00', $payload['timeSlots']);
    }

    public function test_saving_slot_minutes_reseeds_teacher_availability(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));
        $teacher = $this->makeUser('teacher', 'teacher1');

        app(AvailabilityService::class)->ensureDefaultTeacherAvailability($teacher->id);

        $this->assertDatabaseHas('teacher_availability', [
            'teacher_id' => $teacher->id,
            'time_slot'  => '09:00-09:30',
        ]);

        $this->putJson('/api/admin/settings', [
            'settings' => ['scheduling.slot_minutes' => 60],
        ])->assertOk();

        $this->assertDatabaseMissing('teacher_availability', [
            'teacher_id' => $teacher->id,
            'time_slot'  => '09:00-09:30',
        ]);
        $this->assertDatabaseHas('teacher_availability', [
            'teacher_id' => $teacher->id,
            'time_slot'  => '09:00-10:00',
            'is_open'    => 1,
        ]);
    }
}
