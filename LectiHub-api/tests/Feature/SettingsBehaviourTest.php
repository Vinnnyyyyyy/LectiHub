<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\AvailabilityService;
use App\Services\ScheduleBookingService;
use App\Services\ScheduleMapper;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SettingsBehaviourTest extends TestCase
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

    public function test_min_notice_hours_drive_booking_lead(): void
    {
        app(SettingsService::class)->setMany(['scheduling.min_notice_hours' => 72]);

        $availability = app(AvailabilityService::class);

        $this->assertSame(72, $availability->minNoticeHours());
        $this->assertSame(3, $availability->bookingLeadDays());
    }

    public function test_meeting_default_and_enabled_providers_come_from_settings(): void
    {
        app(SettingsService::class)->setMany([
            'meetings.default_provider'  => 'zoom',
            'meetings.enabled_providers' => ['zoom', 'jitsi'],
        ]);

        $mapper = app(ScheduleMapper::class);

        $this->assertSame('zoom', $mapper->getMeetingProvider());
        $this->assertSame(['zoom', 'jitsi'], $mapper->enabledMeetingProviders());
        $this->assertFalse($mapper->isEnabledMeetingProvider('google_meet'));
        $this->assertSame('zoom', $mapper->normalizeMeetingProvider('google_meet'));
    }

    public function test_reminder_windows_follow_centre_settings(): void
    {
        app(SettingsService::class)->setMany([
            'reminders.class_reminder_hours' => [24, 0.25],
        ]);

        $windows = app(ScheduleBookingService::class)->reminderWindows();
        $keys = array_column($windows, 'key');

        $this->assertContains('24h', $keys);
        $this->assertContains('15m', $keys);
    }

    public function test_public_settings_include_term_bounds(): void
    {
        Sanctum::actingAs($this->makeUser('student', 'student1'));

        app(SettingsService::class)->setMany([
            'center.term_start' => '2026-08-01',
            'center.term_end'   => '2026-12-15',
        ]);

        $settings = $this->getJson('/api/settings')->assertOk()->json('settings');

        $this->assertSame('2026-08-01', $settings['center.term_start']);
        $this->assertSame('2026-12-15', $settings['center.term_end']);
        $this->assertArrayHasKey('scheduling.min_notice_hours', $settings);
    }
}
