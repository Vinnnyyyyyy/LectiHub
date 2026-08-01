<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserPasswordTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, string $username, string $password = 'secret123'): User
    {
        return User::create([
            'username'  => $username,
            'email'     => $username . '@test.local',
            'password'  => $password,
            'full_name' => ucfirst($username),
            'role'      => $role,
        ]);
    }

    public function test_admin_can_change_any_users_password(): void
    {
        $admin = $this->makeUser('admin', 'admin1');
        $student = $this->makeUser('student', 'student1', 'oldpass1');

        Sanctum::actingAs($admin);

        $this->patchJson("/api/users/{$student->id}/password", [
            'password' => 'newpass99',
        ])
            ->assertOk()
            ->assertJsonPath('userId', $student->id);

        $student->refresh();
        $this->assertTrue(Hash::check('newpass99', $student->password));
        $this->assertTrue((bool) $student->must_change_password);
    }

    public function test_non_admin_cannot_change_passwords(): void
    {
        $teacher = $this->makeUser('teacher', 'teacher1');
        $student = $this->makeUser('student', 'student1');

        Sanctum::actingAs($teacher);

        $this->patchJson("/api/users/{$student->id}/password", [
            'password' => 'newpass99',
        ])->assertForbidden();
    }

    public function test_password_must_be_at_least_six_characters(): void
    {
        $admin = $this->makeUser('admin', 'admin1');
        $student = $this->makeUser('student', 'student1');

        Sanctum::actingAs($admin);

        $this->patchJson("/api/users/{$student->id}/password", [
            'password' => '123',
        ])->assertStatus(400);
    }
}
