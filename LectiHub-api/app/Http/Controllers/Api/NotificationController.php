<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    // -----------------------------------------------------------------------
    // Row mapper  (mirrors mapNotification from notificationController.js)
    // -----------------------------------------------------------------------

    private function mapNotification(Notification $n): array
    {
        $details = null;
        if ($n->details) {
            try {
                $details = json_decode($n->details, true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                $details = null;
            }
        }

        return [
            'id'               => $n->id,
            'type'             => $n->type,
            'title'            => $n->title,
            'message'          => $n->message ?? '',
            'relatedRequestId' => $n->related_request_id,
            'relatedClassId'   => $n->related_class_id,
            'details'          => $details,
            'deliverAt'        => $n->deliver_at ? $n->deliver_at->format('Y-m-d H:i:s') : null,
            'isRead'           => (bool) $n->is_read,
            'createdAt'        => $n->created_at,
        ];
    }

    // -----------------------------------------------------------------------
    // GET /notifications
    // -----------------------------------------------------------------------

    public function listMyNotifications(Request $request): JsonResponse
    {
        try {
            /** @var \App\Models\User $authUser */
            $authUser = $request->user();
            $userId   = $authUser->id;

            $notifications = Notification::where('user_id', $userId)
                ->where(function ($q) {
                    $q->whereNull('deliver_at')
                      ->orWhere('deliver_at', '<=', now());
                })
                ->orderByDesc('created_at')
                ->limit(50)
                ->get();

            $unreadCount = Notification::where('user_id', $userId)
                ->where('is_read', false)
                ->where(function ($q) {
                    $q->whereNull('deliver_at')
                      ->orWhere('deliver_at', '<=', now());
                })
                ->count();

            $pendingReminders = Notification::where('user_id', $userId)
                ->where('type', 'class_reminder')
                ->whereNotNull('deliver_at')
                ->where('deliver_at', '>', now())
                ->orderBy('deliver_at')
                ->limit(10)
                ->get()
                ->map(function (Notification $n) {
                    $details = null;
                    if ($n->details) {
                        try {
                            $details = json_decode($n->details, true, 512, JSON_THROW_ON_ERROR);
                        } catch (\JsonException) {
                            $details = null;
                        }
                    }
                    return [
                        'id'               => $n->id,
                        'type'             => $n->type,
                        'title'            => $n->title,
                        'deliverAt'        => $n->deliver_at ? $n->deliver_at->format('Y-m-d H:i:s') : null,
                        'relatedClassId'   => $n->related_class_id,
                        'relatedRequestId' => $n->related_request_id,
                        'details'          => $details,
                    ];
                })
                ->all();

            return response()->json([
                'unreadCount'      => $unreadCount,
                'notifications'    => $notifications->map(fn ($n) => $this->mapNotification($n))->all(),
                'pendingReminders' => $pendingReminders,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error loading notifications', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // PATCH /notifications/:id/read
    // -----------------------------------------------------------------------

    public function markNotificationRead(Request $request, int $id): JsonResponse
    {
        try {
            if ($id < 1) {
                return response()->json(['message' => 'Invalid notification id'], 400);
            }

            /** @var \App\Models\User $authUser */
            $authUser = $request->user();

            $updated = Notification::where('id', $id)
                ->where('user_id', $authUser->id)
                ->update(['is_read' => true]);

            if (!$updated) {
                return response()->json(['message' => 'Notification not found'], 404);
            }

            return response()->json(['message' => 'Notification marked as read']);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error updating notification', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // PATCH /notifications/read-all
    // -----------------------------------------------------------------------

    public function markAllNotificationsRead(Request $request): JsonResponse
    {
        try {
            /** @var \App\Models\User $authUser */
            $authUser = $request->user();

            Notification::where('user_id', $authUser->id)
                ->where('is_read', false)
                ->where(function ($q) {
                    $q->whereNull('deliver_at')
                      ->orWhere('deliver_at', '<=', now());
                })
                ->update(['is_read' => true]);

            return response()->json(['message' => 'All notifications marked as read']);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error updating notifications', 'error' => $e->getMessage()], 500);
        }
    }
}
