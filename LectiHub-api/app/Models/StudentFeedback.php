<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentFeedback extends Model
{
    protected $table = 'student_feedback';

    protected $fillable = [
        'lesson_report_id',
        'class_id',
        'student_id',
        'teacher_id',
        'overall_rating',
        'comments',
        'suggestions',
        'learning_experience',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'overall_rating' => 'integer',
            'submitted_at'   => 'datetime',
        ];
    }

    public function lessonReport(): BelongsTo
    {
        return $this->belongsTo(LessonReport::class, 'lesson_report_id');
    }

    public function lectiClass(): BelongsTo
    {
        return $this->belongsTo(LectiClass::class, 'class_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }
}
