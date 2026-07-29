<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'title',
        'message',
        'related_request_id',
        'related_class_id',
        'is_read',
        'details',
        'deliver_at',
    ];

    protected function casts(): array
    {
        return [
            'is_read'    => 'boolean',
            'deliver_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function relatedRequest(): BelongsTo
    {
        return $this->belongsTo(ScheduleRequest::class, 'related_request_id');
    }

    public function relatedClass(): BelongsTo
    {
        return $this->belongsTo(LectiClass::class, 'related_class_id');
    }
}
