<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'username',
        'email',
        'password',
        'full_name',
        'role',
        'must_change_password',
        'subject_expertise',
        'created_by',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'must_change_password' => 'boolean',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(self::class, 'created_by');
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isTeacher(): bool
    {
        return $this->role === 'teacher';
    }

    public function isStudent(): bool
    {
        return $this->role === 'student';
    }

    // --- Domain relationships ---

    public function scheduleRequests(): HasMany
    {
        return $this->hasMany(ScheduleRequest::class, 'student_id');
    }

    public function assignedScheduleRequests(): HasMany
    {
        return $this->hasMany(ScheduleRequest::class, 'assigned_teacher_id');
    }

    public function classesAsTeacher(): HasMany
    {
        return $this->hasMany(LectiClass::class, 'teacher_id');
    }

    public function classesAsStudent(): HasMany
    {
        return $this->hasMany(LectiClass::class, 'student_id');
    }

    /**
     * App-level notifications (distinct from Laravel's built-in notifications() from Notifiable).
     */
    public function appNotifications(): HasMany
    {
        return $this->hasMany(Notification::class, 'user_id');
    }

    public function calendarConnection(): HasOne
    {
        return $this->hasOne(CalendarConnection::class, 'user_id');
    }

    public function calendarConnections(): HasMany
    {
        return $this->hasMany(CalendarConnection::class, 'user_id');
    }

    public function calendarEvents(): HasMany
    {
        return $this->hasMany(CalendarEvent::class, 'user_id');
    }

    public function lessonReportsAsTeacher(): HasMany
    {
        return $this->hasMany(LessonReport::class, 'teacher_id');
    }

    public function lessonReportsAsStudent(): HasMany
    {
        return $this->hasMany(LessonReport::class, 'student_id');
    }

    public function studentFeedbackGiven(): HasMany
    {
        return $this->hasMany(StudentFeedback::class, 'student_id');
    }

    public function conversationsAsStudent(): HasMany
    {
        return $this->hasMany(Conversation::class, 'student_id');
    }

    public function conversationsAsTeacher(): HasMany
    {
        return $this->hasMany(Conversation::class, 'teacher_id');
    }

    public function paymentReceipts(): HasMany
    {
        return $this->hasMany(PaymentReceipt::class, 'student_id');
    }

    public function teacherAvailability(): HasMany
    {
        return $this->hasMany(TeacherAvailability::class, 'teacher_id');
    }
}
