<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class LectiClass extends Model
{
    protected $table = 'classes';

    protected $fillable = [
        'teacher_id',
        'student_id',
        'class_date',
        'time_slot',
        'title',
        'schedule_request_id',
        'start_time',
        'end_time',
        'duration_minutes',
        'meeting_info',
        'meeting_link',
        'meeting_provider',
        'status',
        'started_at',
        'subject',
        'curriculum_plan',
        'attendance_status',
        'attendance_recorded_at',
        'participation_level',
        'participation_notes',
        'recording_url',
        'completed_at',
        'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'duration_minutes'       => 'integer',
            'started_at'             => 'datetime',
            'attendance_recorded_at' => 'datetime',
            'completed_at'           => 'datetime',
            'archived_at'            => 'datetime',
        ];
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function scheduleRequest(): BelongsTo
    {
        return $this->belongsTo(ScheduleRequest::class, 'schedule_request_id');
    }

    public function lessonReport(): HasOne
    {
        return $this->hasOne(LessonReport::class, 'class_id');
    }

    public function studentFeedback(): HasOne
    {
        return $this->hasOne(StudentFeedback::class, 'class_id');
    }

    public function calendarEvents(): HasMany
    {
        return $this->hasMany(CalendarEvent::class, 'class_id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class, 'related_class_id');
    }
}
