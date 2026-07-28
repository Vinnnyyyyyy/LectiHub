<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\LectiClass;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatController extends Controller
{
    // -----------------------------------------------------------------------
    // Mappers
    // -----------------------------------------------------------------------

    private function mapUser(?User $user): ?array
    {
        if (! $user) {
            return null;
        }

        return [
            'id'       => $user->id,
            'username' => $user->username,
            'fullName' => $user->full_name ?: $user->username,
            'email'    => $user->email ?? '',
        ];
    }

    private function mapMessage(Message $msg, int $currentUserId): array
    {
        $sender = $msg->sender;

        return [
            'id'             => $msg->id,
            'conversationId' => $msg->conversation_id,
            'senderId'       => $msg->sender_id,
            'body'           => $msg->body,
            'isRead'         => (bool) $msg->is_read,
            'createdAt'      => $msg->created_at,
            'mine'           => $msg->sender_id === $currentUserId,
            'sender'         => $this->mapUser($sender),
        ];
    }

    // -----------------------------------------------------------------------
    // Pair-assignment guards
    // -----------------------------------------------------------------------

    /**
     * True when this student/teacher pair has at least one class together
     * in a booked status (scheduled, in_progress, completed).
     */
    private function pairIsAssigned(int $studentId, int $teacherId): bool
    {
        return LectiClass::where('student_id', $studentId)
            ->where('teacher_id', $teacherId)
            ->whereRaw("LOWER(COALESCE(status, '')) IN ('scheduled', 'in_progress', 'completed')")
            ->exists();
    }

    /**
     * Resolve the (studentId, teacherId, peer) triple for the current user and
     * a given peer, enforcing the role-pair constraint.
     *
     * Returns null when the peer doesn't exist, the roles don't match, or the
     * pair has no assigned class together.
     *
     * @return array{studentId:int,teacherId:int,peer:array}|null
     */
    private function resolvePair(int $peerId, int $userId, string $role): ?array
    {
        if ($peerId < 1) {
            return null;
        }

        /** @var User|null $peer */
        $peer = User::find($peerId);
        if (! $peer) {
            return null;
        }

        $studentId = null;
        $teacherId = null;

        if ($role === 'student') {
            if ($peer->role !== 'teacher') {
                return null;
            }
            $studentId = $userId;
            $teacherId = $peerId;
        } elseif ($role === 'teacher') {
            if ($peer->role !== 'student') {
                return null;
            }
            $studentId = $peerId;
            $teacherId = $userId;
        } else {
            return null;
        }

        if (! $this->pairIsAssigned($studentId, $teacherId)) {
            return null;
        }

        return [
            'studentId' => $studentId,
            'teacherId' => $teacherId,
            'peer'      => $this->mapUser($peer),
        ];
    }

    /**
     * Find or create the Conversation row for a student/teacher pair.
     */
    private function getOrCreateConversation(int $studentId, int $teacherId): Conversation
    {
        return Conversation::firstOrCreate(
            ['student_id' => $studentId, 'teacher_id' => $teacherId]
        );
    }

    // -----------------------------------------------------------------------
    // Assigned-peer lists (for thread index)
    // -----------------------------------------------------------------------

    /**
     * @return User[]
     */
    private function listAssignedPeers(int $userId, string $role): array
    {
        if ($role === 'student') {
            return User::select('users.*')
                ->join('classes as c', 'c.teacher_id', '=', 'users.id')
                ->where('c.student_id', $userId)
                ->whereNotNull('c.teacher_id')
                ->whereRaw("LOWER(COALESCE(c.status, '')) IN ('scheduled', 'in_progress', 'completed')")
                ->distinct()
                ->orderByRaw('LOWER(COALESCE(users.full_name, users.username)) ASC')
                ->get()
                ->all();
        }

        if ($role === 'teacher') {
            return User::select('users.*')
                ->join('classes as c', 'c.student_id', '=', 'users.id')
                ->where('c.teacher_id', $userId)
                ->whereNotNull('c.student_id')
                ->whereRaw("LOWER(COALESCE(c.status, '')) IN ('scheduled', 'in_progress', 'completed')")
                ->distinct()
                ->orderByRaw('LOWER(COALESCE(users.full_name, users.username)) ASC')
                ->get()
                ->all();
        }

        return [];
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    /**
     * GET /chat/threads
     *
     * List all chat threads for the authenticated student or teacher.
     * Returns { threads, unreadTotal }.
     */
    public function listChatThreads(Request $request): JsonResponse
    {
        /** @var \App\Models\User $authUser */
        $authUser = $request->user();
        $userId   = $authUser->id;
        $role     = $authUser->role;

        $peers       = $this->listAssignedPeers($userId, $role);
        $unreadTotal = 0;
        $threads     = [];

        foreach ($peers as $peer) {
            $studentId = $role === 'student' ? $userId : $peer->id;
            $teacherId = $role === 'teacher' ? $userId : $peer->id;

            $conversation = Conversation::where('student_id', $studentId)
                ->where('teacher_id', $teacherId)
                ->first();

            $unreadCount = 0;
            $lastMessage = null;

            if ($conversation) {
                $unreadCount = Message::where('conversation_id', $conversation->id)
                    ->where('sender_id', '!=', $userId)
                    ->where('is_read', false)
                    ->count();

                $lastRow = Message::with('sender')
                    ->where('conversation_id', $conversation->id)
                    ->orderByDesc('id')
                    ->first();

                if ($lastRow) {
                    $lastMessage = $this->mapMessage($lastRow, $userId);
                }
            }

            $unreadTotal += $unreadCount;

            $threads[] = [
                'peerId'         => $peer->id,
                'conversationId' => $conversation?->id ?? null,
                'peer'           => $this->mapUser($peer),
                'unreadCount'    => $unreadCount,
                'lastMessage'    => $lastMessage,
            ];
        }

        // Contacts with recent messages float to the top; ties sorted by name.
        usort($threads, function (array $a, array $b): int {
            $aTime = $a['lastMessage'] ? (int) strtotime((string) ($a['lastMessage']['createdAt'] ?? '')) : 0;
            $bTime = $b['lastMessage'] ? (int) strtotime((string) ($b['lastMessage']['createdAt'] ?? '')) : 0;
            if ($bTime !== $aTime) {
                return $bTime <=> $aTime;
            }

            return strcmp(
                (string) ($a['peer']['fullName'] ?? ''),
                (string) ($b['peer']['fullName'] ?? '')
            );
        });

        return response()->json(['threads' => $threads, 'unreadTotal' => $unreadTotal]);
    }

    /**
     * GET /chat/peer/{peerId}
     *
     * Return full message history with a peer, creating the conversation if
     * needed, and mark all incoming messages as read.
     */
    public function listMessagesForPeer(Request $request, int $peerId): JsonResponse
    {
        /** @var \App\Models\User $authUser */
        $authUser = $request->user();
        $pair     = $this->resolvePair($peerId, $authUser->id, $authUser->role);

        if (! $pair) {
            return response()->json(
                ['message' => 'Chat is only available with your assigned teacher or student'],
                404
            );
        }

        $conversation = $this->getOrCreateConversation($pair['studentId'], $pair['teacherId']);

        $messages = Message::with('sender')
            ->where('conversation_id', $conversation->id)
            ->orderBy('id')
            ->get()
            ->map(fn ($msg) => $this->mapMessage($msg, $authUser->id))
            ->values()
            ->all();

        Message::where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', $authUser->id)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json([
            'conversationId' => $conversation->id,
            'peerId'         => $peerId,
            'peer'           => $pair['peer'],
            'messages'       => $messages,
        ]);
    }

    /**
     * POST /chat/peer/{peerId}
     *
     * Send a message to a peer. Body max 2000 characters.
     * Returns 201 { message, item }.
     */
    public function sendMessageForPeer(Request $request, int $peerId): JsonResponse
    {
        $body = trim((string) ($request->input('body') ?? ''));

        if ($body === '') {
            return response()->json(['message' => 'Message cannot be empty'], 400);
        }
        if (mb_strlen($body) > 2000) {
            return response()->json(['message' => 'Message is too long (max 2000 characters)'], 400);
        }

        /** @var \App\Models\User $authUser */
        $authUser = $request->user();
        $pair     = $this->resolvePair($peerId, $authUser->id, $authUser->role);

        if (! $pair) {
            return response()->json(
                ['message' => 'Chat is only available with your assigned teacher or student'],
                404
            );
        }

        $conversation = $this->getOrCreateConversation($pair['studentId'], $pair['teacherId']);

        $msg = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id'       => $authUser->id,
            'body'            => $body,
            'is_read'         => false,
        ]);

        $msg->load('sender');

        return response()->json([
            'message' => 'Message sent',
            'item'    => $this->mapMessage($msg, $authUser->id),
        ], 201);
    }
}
