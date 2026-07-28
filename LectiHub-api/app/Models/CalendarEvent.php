<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CalendarEvent extends Model
{
    protected $fillable = [
        'user_id',
        'class_id',
        'title',
        'description',
        'event_date',
        'start_time',
        'end_time',
        'duration_minutes',
        'meeting_info',
        'meeting_link',
        'provider',
        'external_event_id',
        'sync_status',
        'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'duration_minutes' => 'integer',
            'synced_at'        => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function lectiClass(): BelongsTo
    {
        return $this->belongsTo(LectiClass::class, 'class_id');
    }
}
