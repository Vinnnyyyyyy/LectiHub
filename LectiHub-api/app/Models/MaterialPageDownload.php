<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaterialPageDownload extends Model
{
    protected $fillable = [
        'material_id',
        'student_id',
        'page_number',
        'download_count',
    ];

    protected function casts(): array
    {
        return [
            'page_number'    => 'integer',
            'download_count' => 'integer',
        ];
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(CourseMaterial::class, 'material_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
