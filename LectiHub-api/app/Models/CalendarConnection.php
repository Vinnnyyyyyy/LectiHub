<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CalendarConnection extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'provider',
        'access_token',
        'refresh_token',
        'external_account',
        'calendar_id',
        'scheduling_url',
        'is_active',
        'connected_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active'    => 'boolean',
            'connected_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
