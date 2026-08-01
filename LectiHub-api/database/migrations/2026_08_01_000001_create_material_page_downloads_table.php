<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Students get a fixed number of downloads per material page.
 * Non-paginated files use page_number = 1 (the whole document).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('material_page_downloads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('material_id')->constrained('course_materials')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('page_number')->default(1);
            $table->unsignedTinyInteger('download_count')->default(0);
            $table->timestamps();

            $table->unique(['material_id', 'student_id', 'page_number'], 'material_page_student_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('material_page_downloads');
    }
};
