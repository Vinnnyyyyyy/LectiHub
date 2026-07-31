<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SettingsTest extends TestCase
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

    public function test_an_empty_table_still_returns_every_default(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->assertDatabaseCount('settings', 0);

        // Keys contain dots, which assertJsonPath reads as path separators —
        // so these are asserted against the decoded array directly.
        $settings = $this->getJson('/api/admin/settings')->assertOk()->json('settings');

        $this->assertSame(30, $settings['scheduling.slot_minutes']);
        $this->assertSame(48, $settings['scheduling.min_notice_hours']);
        $this->assertSame([24, 1], $settings['reminders.class_reminder_hours']);
    }

    public function test_saving_a_value_overrides_the_default(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $settings = $this->putJson('/api/admin/settings', [
            'settings' => ['scheduling.slot_minutes' => 60, 'scheduling.min_notice_hours' => 24],
        ])->assertOk()->json('settings');

        $this->assertSame(60, $settings['scheduling.slot_minutes']);
        $this->assertSame(60, app(SettingsService::class)->get('scheduling.slot_minutes'));
        $this->assertSame(24, app(SettingsService::class)->get('scheduling.min_notice_hours'));
    }

    public function test_scalars_survive_the_json_round_trip(): void
    {
        $settings = app(SettingsService::class);
        $settings->setMany([
            'scheduling.slot_minutes'              => 60,
            'scheduling.auto_approve_single_match' => true,
            'center.name'                          => 'Meridian Learning Center',
            'reminders.class_reminder_hours'       => [48, 12, 1],
        ]);

        $this->assertSame(60, $settings->get('scheduling.slot_minutes'));
        $this->assertTrue($settings->get('scheduling.auto_approve_single_match'));
        $this->assertSame('Meridian Learning Center', $settings->get('center.name'));
        $this->assertSame([48, 12, 1], $settings->get('reminders.class_reminder_hours'));
    }

    public function test_unknown_keys_are_ignored_not_saved(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->putJson('/api/admin/settings', [
            'settings' => ['scheduling.slot_minutes' => 60, 'evil.key' => 'nope'],
        ])
            ->assertOk()
            ->assertJsonPath('applied', ['scheduling.slot_minutes'])
            ->assertJsonPath('ignored', ['evil.key']);

        $this->assertDatabaseMissing('settings', ['key' => 'evil.key']);
    }

    public function test_wrongly_typed_values_are_rejected_and_leave_the_default(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->putJson('/api/admin/settings', [
            'settings' => [
                'scheduling.slot_minutes'        => 'half an hour',
                'reminders.class_reminder_hours' => 'soon',
            ],
        ])->assertOk()->assertJsonPath('applied', []);

        $settings = app(SettingsService::class);
        $this->assertSame(30, $settings->get('scheduling.slot_minutes'));
        $this->assertSame([24, 1], $settings->get('reminders.class_reminder_hours'));
    }

    public function test_booleans_accept_the_shapes_a_form_sends(): void
    {
        $settings = app(SettingsService::class);

        $settings->setMany(['scheduling.auto_approve_single_match' => 'true']);
        $this->assertTrue($settings->get('scheduling.auto_approve_single_match'));

        $settings->setMany(['scheduling.auto_approve_single_match' => '0']);
        $this->assertFalse($settings->get('scheduling.auto_approve_single_match'));
    }

    public function test_a_required_string_cannot_be_blanked_but_a_nullable_one_can(): void
    {
        $settings = app(SettingsService::class);
        $settings->setMany(['center.name' => 'Meridian', 'center.term_start' => '2026-07-01']);

        // Blanking the centre name is refused — the default stands.
        $settings->setMany(['center.name' => '']);
        $this->assertSame('Meridian', $settings->get('center.name'));

        // Term dates are nullable, so clearing them works.
        $settings->setMany(['center.term_start' => '']);
        $this->assertNull($settings->get('center.term_start'));
    }

    public function test_students_read_the_public_subset_only(): void
    {
        app(SettingsService::class)->setMany(['scheduling.slot_minutes' => 60]);

        Sanctum::actingAs($this->makeUser('student', 'student1'));

        $response = $this->getJson('/api/settings')->assertOk();
        $settings = $response->json('settings');

        $this->assertSame(60, $settings['scheduling.slot_minutes']);
        $this->assertArrayHasKey('scheduling.min_notice_hours', $settings);
        // Admin-only keys are absent.
        $this->assertArrayNotHasKey('scheduling.auto_approve_single_match', $settings);
        $this->assertArrayNotHasKey('records.audit_retention_months', $settings);
    }

    public function test_non_admins_cannot_read_or_write_the_admin_settings(): void
    {
        Sanctum::actingAs($this->makeUser('teacher', 'teacher1'));

        $this->getJson('/api/admin/settings')->assertForbidden();
        $this->putJson('/api/admin/settings', ['settings' => ['scheduling.slot_minutes' => 60]])
            ->assertForbidden();
    }

    public function test_saving_settings_is_audited(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->putJson('/api/admin/settings', [
            'settings' => ['scheduling.slot_minutes' => 60],
        ])->assertOk();

        $this->assertDatabaseHas('audit_events', [
            'category' => 'settings',
            'action'   => 'settings.updated',
        ]);
    }

    public function test_a_save_with_nothing_applicable_writes_no_audit_entry(): void
    {
        Sanctum::actingAs($this->makeUser('admin', 'admin1'));

        $this->putJson('/api/admin/settings', ['settings' => ['evil.key' => 'nope']])
            ->assertOk()
            ->assertJsonPath('message', 'Nothing to save.');

        $this->assertDatabaseCount('audit_events', 0);
    }
}
