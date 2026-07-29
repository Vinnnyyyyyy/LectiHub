<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TeacherAvailability extends Model
{
    protected $table = 'teacher_availability';

    public $timestamps = false;

    protected $fillable = [
        'teacher_id',
        'weekday',
        'time_slot',
        'is_open',
    ];

    protected function casts(): array
    {
        return [
            'weekday' => 'integer',
            'is_open' => 'boolean',
        ];
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }
}
