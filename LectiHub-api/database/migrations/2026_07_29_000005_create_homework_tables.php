<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Homework is assigned per student, so the pairing lives on this row
        // rather than on a join table. One student, one piece of work.
        Schema::create('homework', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();

            // Where it came from — all optional so homework can be set standalone.
            $table->foreignId('class_id')->nullable()->constrained('classes')->nullOnDelete();
            $table->foreignId('course_id')->nullable()->constrained('courses')->nullOnDelete();
            $table->foreignId('lesson_report_id')->nullable()->constrained('lesson_reports')->nullOnDelete();

            $table->string('title');
            $table->text('instructions')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->unsignedSmallInteger('max_score')->default(100);
            $table->timestamps();

            $table->index(['student_id', 'due_at']);
            $table->index(['teacher_id', 'due_at']);
        });

        // One submission per homework — resubmitting overwrites in place, so
        // the pair stays unique and "has it been handed in" stays a simple check.
        Schema::create('homework_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('homework_id')->unique()->constrained('homework')->cascadeOnDelete();

            $table->text('body')->nullable();
            $table->string('original_name')->nullable();
            $table->string('storage_path')->nullable();
            $table->timestamp('submitted_at')->nullable();

            $table->unsignedSmallInteger('score')->nullable();
            $table->text('feedback')->nullable();
            $table->timestamp('graded_at')->nullable();
            $table->foreignId('graded_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('homework_submissions');
        Schema::dropIfExists('homework');
    }
};
