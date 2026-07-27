<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::query()->updateOrCreate(
            ['username' => 'admin'],
            [
                'email' => 'admin@lectihub.local',
                'password' => 'admin123',
                'full_name' => 'LectiHub Admin',
                'role' => 'admin',
                'must_change_password' => false,
            ],
        );

        foreach (['teacher_ava' => 'Ava Teacher', 'teacher_ben' => 'Ben Teacher', 'teacher_cara' => 'Cara Teacher'] as $username => $fullName) {
            User::query()->updateOrCreate(
                ['username' => $username],
                [
                    'email' => $username.'@lectihub.local',
                    'password' => 'teacher123',
                    'full_name' => $fullName,
                    'role' => 'teacher',
                    'must_change_password' => false,
                    'subject_expertise' => 'General',
                ],
            );
        }
    }
}
