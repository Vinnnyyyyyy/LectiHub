<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:60', 'unique:users,username'],
            'email' => ['required', 'email', 'max:180', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'full_name' => ['nullable', 'string', 'max:120'],
        ]);

        $user = User::query()->create([
            'username' => trim($data['username']),
            'email' => strtolower(trim($data['email'])),
            'password' => $data['password'],
            'full_name' => isset($data['full_name']) ? trim($data['full_name']) : null,
            'role' => 'student',
            'must_change_password' => false,
        ]);

        return response()->json($this->issueAuthResponse($user), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()->where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        return response()->json($this->issueAuthResponse($user));
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'username' => $user->username,
            'email' => $user->email,
            'role' => $user->role,
            'fullName' => $user->full_name ?: $user->username,
            'mustChangePassword' => (bool) $user->must_change_password,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out']);
    }

    /**
     * Match the Vue auth store payload shape from the previous Express API.
     *
     * @return array{token: string, role: string, username: string, fullName: string, mustChangePassword: bool}
     */
    private function issueAuthResponse(User $user): array
    {
        $user->tokens()->where('name', 'lectihub')->delete();
        $token = $user->createToken('lectihub')->plainTextToken;

        return [
            'token' => $token,
            'role' => $user->role,
            'username' => $user->username,
            'fullName' => $user->full_name ?: $user->username,
            'mustChangePassword' => (bool) $user->must_change_password,
        ];
    }
}
