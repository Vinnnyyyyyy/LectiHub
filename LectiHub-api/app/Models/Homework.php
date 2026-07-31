<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Homework extends Model
{
    protected $table = 'homework';

    protected $fillable = [
        'teacher_id',
        'student_id',
        'class_id',
        'course_id',
        'lesson_report_id',
        'title',
        'instructions',
        'due_at',
        'max_score',
    ];

    protected function casts(): array
    {
        return [
            'due_at'    => 'datetime',
            'max_score' => 'integer',
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

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function submission(): HasOne
    {
        return $this->hasOne(HomeworkSubmission::class);
    }

    /** pending -> submitted -> graded, derived rather than stored. */
    public function status(): string
    {
        $submission = $this->submission;

        if (! $submission || $submission->submitted_at === null) {
            return 'pending';
        }

        return $submission->graded_at !== null ? 'graded' : 'submitted';
    }
}
