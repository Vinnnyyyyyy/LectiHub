<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();

            // Nullable for system-generated events. actor_name is denormalised
            // so the log still reads correctly after the account is deleted —
            // which is itself one of the things being logged.
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name')->default('System');

            $table->enum('category', [
                'scheduling', 'accounts', 'materials', 'announcements', 'settings',
            ]);
            $table->string('action');
            $table->string('description');

            // What it happened to, for filtering and future deep links.
            $table->string('entity_type')->nullable();
            $table->unsignedBigInteger('entity_id')->nullable();

            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['category', 'created_at']);
            $table->index(['entity_type', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
    }
};
