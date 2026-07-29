<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleRequestSlot extends Model
{
    protected $fillable = [
        'request_id',
        'preferred_date',
        'time_slot',
    ];

    public function request(): BelongsTo
    {
        return $this->belongsTo(ScheduleRequest::class, 'request_id');
    }
}
