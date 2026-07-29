<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class LessonReport extends Model
{
    protected $fillable = [
        'class_id',
        'teacher_id',
        'student_id',
        'report_date',
        'report_time',
        'lesson_topic',
        'pages_discussed',
        'attendance_status',
        'homework_assigned',
        'remarks',
        'student_progress',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
        ];
    }

    public function lectiClass(): BelongsTo
    {
        return $this->belongsTo(LectiClass::class, 'class_id');
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function feedback(): HasOne
    {
        return $this->hasOne(StudentFeedback::class, 'lesson_report_id');
    }
}
