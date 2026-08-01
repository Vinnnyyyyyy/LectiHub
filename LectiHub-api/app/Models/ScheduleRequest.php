<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ScheduleRequest extends Model
{
    protected $fillable = [
        'student_id',
        'remarks',
        'status',
        'assigned_teacher_id',
        'assigned_slot_id',
        'assigned_by',
        'assigned_at',
        'source',
        'program',
        'entity_type',
        'preferred_meeting_provider',
    ];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function assignedTeacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_teacher_id');
    }

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function assignedSlot(): BelongsTo
    {
        return $this->belongsTo(ScheduleRequestSlot::class, 'assigned_slot_id');
    }

    public function slots(): HasMany
    {
        return $this->hasMany(ScheduleRequestSlot::class, 'request_id');
    }

    public function classes(): HasMany
    {
        return $this->hasMany(LectiClass::class, 'schedule_request_id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class, 'related_request_id');
    }
}
