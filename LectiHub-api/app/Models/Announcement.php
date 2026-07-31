<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Announcement extends Model
{
    protected $fillable = [
        'author_id',
        'subject',
        'body',
        'audience_type',
        'course_id',
        'send_email',
        'status',
        'scheduled_for',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'send_email'    => 'boolean',
            'scheduled_for' => 'datetime',
            'sent_at'       => 'datetime',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(AnnouncementRecipient::class);
    }

    /** Explicit targets chosen while still a draft. */
    public function targets(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'announcement_targets', 'announcement_id', 'user_id');
    }
}
