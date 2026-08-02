<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthPasswordTest extends TestCase
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
            'must_change_password' => true,
        ]);
    }

    public function test_student_can_change_own_password(): void
    {
        $student = $this->makeUser('student', 'student1', 'oldpass1');
        Sanctum::actingAs($student);

        $this->patchJson('/api/auth/password', [
            'currentPassword' => 'oldpass1',
            'newPassword' => 'newpass99',
        ])
            ->assertOk()
            ->assertJsonPath('mustChangePassword', false);

        $student->refresh();
        $this->assertTrue(Hash::check('newpass99', $student->password));
        $this->assertFalse((bool) $student->must_change_password);
    }

    public function test_teacher_can_change_own_password(): void
    {
        $teacher = $this->makeUser('teacher', 'teacher1', 'teachpass');
        Sanctum::actingAs($teacher);

        $this->patchJson('/api/auth/password', [
            'currentPassword' => 'teachpass',
            'newPassword' => 'freshpass1',
        ])->assertOk();

        $teacher->refresh();
        $this->assertTrue(Hash::check('freshpass1', $teacher->password));
    }

    public function test_wrong_current_password_is_rejected(): void
    {
        $student = $this->makeUser('student', 'student1', 'oldpass1');
        Sanctum::actingAs($student);

        $this->patchJson('/api/auth/password', [
            'currentPassword' => 'wrong',
            'newPassword' => 'newpass99',
        ])->assertStatus(400);
    }

    public function test_new_password_must_be_at_least_six_characters(): void
    {
        $student = $this->makeUser('student', 'student1', 'oldpass1');
        Sanctum::actingAs($student);

        $this->patchJson('/api/auth/password', [
            'currentPassword' => 'oldpass1',
            'newPassword' => '123',
        ])->assertStatus(422);
    }

    public function test_guest_cannot_change_password(): void
    {
        $this->patchJson('/api/auth/password', [
            'currentPassword' => 'oldpass1',
            'newPassword' => 'newpass99',
        ])->assertUnauthorized();
    }
}
