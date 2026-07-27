<?php

namespace App\Services;

use App\Models\Notification;

/**
 * In-app notification helper.
 * Wraps the Notification model to provide a single canonical insert path
 * used by TrialSchedulerService, CalendarSyncService, and other services.
 */
class NotificationService
{
    /**
     * Persist a notification row for a single user.
     *
     * @param  array<string,mixed>  $details  Optional JSON-serialisable details blob.
     */
    public function createNotification(
        int $userId,
        string $type,
        string $title,
        string $message,
        ?int $relatedRequestId = null,
        ?int $relatedClassId   = null,
        array $details         = [],
        ?string $deliverAt     = null
    ): Notification {
        return Notification::create([
            'user_id'            => $userId,
            'type'               => $type,
            'title'              => $title,
            'message'            => $message,
            'related_request_id' => $relatedRequestId,
            'related_class_id'   => $relatedClassId,
            'details'            => !empty($details) ? json_encode($details) : null,
            'deliver_at'         => $deliverAt,
        ]);
    }

    /**
     * Fan-out a notification to multiple users at once.
     *
     * @param  int[]  $userIds
     * @param  array<string,mixed>  $details
     */
    public function notifyMany(
        array $userIds,
        string $type,
        string $title,
        string $message,
        ?int $relatedRequestId = null,
        ?int $relatedClassId   = null,
        array $details         = [],
        ?string $deliverAt     = null
    ): void {
        foreach ($userIds as $userId) {
            $this->createNotification(
                (int) $userId,
                $type,
                $title,
                $message,
                $relatedRequestId,
                $relatedClassId,
                $details,
                $deliverAt
            );
        }
    }
}
