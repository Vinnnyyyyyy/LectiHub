<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedule_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users');
            $table->text('remarks')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->foreignId('assigned_teacher_id')->nullable()->constrained('users')->nullOnDelete();
            // assigned_slot_id intentionally has no FK constraint (circular ref; Express schema omits it too)
            $table->unsignedBigInteger('assigned_slot_id')->nullable();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->string('source')->default('student');
            $table->string('program')->nullable();
            $table->string('entity_type')->nullable();
            $table->string('preferred_meeting_provider')->nullable();
            $table->timestamps();
        });

        Schema::create('schedule_request_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('request_id')->constrained('schedule_requests')->cascadeOnDelete();
            $table->string('preferred_date');
            $table->string('time_slot');
            $table->timestamps();
        });

        Schema::create('classes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users');
            $table->foreignId('student_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('class_date');
            $table->string('time_slot');
            $table->string('title')->nullable();
            $table->unsignedBigInteger('schedule_request_id')->nullable();
            $table->string('start_time')->nullable();
            $table->string('end_time')->nullable();
            $table->integer('duration_minutes')->nullable();
            $table->text('meeting_info')->nullable();
            $table->string('meeting_link')->nullable();
            $table->string('meeting_provider')->default('jitsi');
            $table->string('status')->default('scheduled');
            $table->timestamp('started_at')->nullable();
            $table->string('subject')->nullable();
            $table->text('curriculum_plan')->nullable();
            $table->string('attendance_status')->default('not_recorded');
            $table->timestamp('attendance_recorded_at')->nullable();
            $table->string('participation_level')->default('not_recorded');
            $table->text('participation_notes')->nullable();
            $table->string('recording_url')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->foreign('schedule_request_id')
                ->references('id')->on('schedule_requests')
                ->nullOnDelete();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->string('type');
            $table->string('title');
            $table->text('message')->nullable();
            $table->unsignedBigInteger('related_request_id')->nullable();
            $table->unsignedBigInteger('related_class_id')->nullable();
            $table->boolean('is_read')->default(false);
            $table->text('details')->nullable();
            $table->timestamp('deliver_at')->nullable();
            $table->timestamps();

            $table->foreign('related_request_id')
                ->references('id')->on('schedule_requests')
                ->nullOnDelete();

            $table->foreign('related_class_id')
                ->references('id')->on('classes')
                ->nullOnDelete();
        });

        Schema::create('calendar_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->enum('provider', ['google', 'calendly']);
            $table->text('access_token')->nullable();
            $table->text('refresh_token')->nullable();
            $table->string('external_account')->nullable();
            $table->string('calendar_id')->nullable();
            $table->string('scheduling_url')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('connected_at')->nullable();

            $table->unique(['user_id', 'provider']);
        });

        Schema::create('calendar_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('class_id')->nullable()->constrained('classes')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('event_date');
            $table->string('start_time');
            $table->string('end_time');
            $table->integer('duration_minutes')->nullable();
            $table->text('meeting_info')->nullable();
            $table->string('meeting_link')->nullable();
            $table->string('provider')->default('lectihub');
            $table->string('external_event_id')->nullable();
            $table->string('sync_status')->default('local_only');
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });

        Schema::create('lesson_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('class_id')->unique()->constrained('classes')->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained('users');
            $table->foreignId('student_id')->constrained('users');
            $table->string('report_date');
            $table->string('report_time');
            $table->string('lesson_topic');
            $table->text('pages_discussed')->nullable();
            $table->string('attendance_status');
            $table->text('homework_assigned')->nullable();
            $table->text('remarks')->nullable();
            $table->text('student_progress')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('student_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lesson_report_id')->unique()->constrained('lesson_reports')->cascadeOnDelete();
            $table->foreignId('class_id')->constrained('classes')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('users');
            $table->foreignId('teacher_id')->constrained('users');
            $table->integer('overall_rating');
            $table->text('comments')->nullable();
            $table->text('suggestions')->nullable();
            $table->text('learning_experience')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users');
            $table->foreignId('teacher_id')->constrained('users');
            $table->timestamps();

            $table->unique(['student_id', 'teacher_id']);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users');
            $table->text('body');
            $table->boolean('is_read')->default(false);
            $table->timestamps();
        });

        Schema::create('payment_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users');
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->integer('amount_cents');
            $table->string('currency')->default('USD');
            $table->enum('method', ['cash', 'card', 'transfer', 'other']);
            $table->enum('status', ['recorded', 'confirmed', 'void']);
            $table->text('description')->nullable();
            $table->string('paid_at');
            $table->string('receipt_number')->unique()->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('teacher_availability', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday'); // 0 = Sunday … 6 = Saturday
            $table->string('time_slot');
            $table->boolean('is_open')->default(true);

            $table->unique(['teacher_id', 'weekday', 'time_slot']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teacher_availability');
        Schema::dropIfExists('payment_receipts');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
        Schema::dropIfExists('student_feedback');
        Schema::dropIfExists('lesson_reports');
        Schema::dropIfExists('calendar_events');
        Schema::dropIfExists('calendar_connections');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('classes');
        Schema::dropIfExists('schedule_request_slots');
        Schema::dropIfExists('schedule_requests');
    }
};
