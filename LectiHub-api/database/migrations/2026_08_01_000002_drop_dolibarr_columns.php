<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Remove leftover Dolibarr CRM columns — LectiHub no longer syncs to Dolibarr. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('schedule_requests')) {
            Schema::table('schedule_requests', function (Blueprint $table) {
                if (Schema::hasColumn('schedule_requests', 'dolibarr_thirdparty_id')) {
                    $table->dropColumn('dolibarr_thirdparty_id');
                }
                if (Schema::hasColumn('schedule_requests', 'dolibarr_ticket_id')) {
                    $table->dropColumn('dolibarr_ticket_id');
                }
            });
        }

        if (Schema::hasTable('payment_receipts')) {
            Schema::table('payment_receipts', function (Blueprint $table) {
                if (Schema::hasColumn('payment_receipts', 'dolibarr_invoice_id')) {
                    $table->dropColumn('dolibarr_invoice_id');
                }
                if (Schema::hasColumn('payment_receipts', 'dolibarr_thirdparty_id')) {
                    $table->dropColumn('dolibarr_thirdparty_id');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('schedule_requests')) {
            Schema::table('schedule_requests', function (Blueprint $table) {
                if (! Schema::hasColumn('schedule_requests', 'dolibarr_thirdparty_id')) {
                    $table->string('dolibarr_thirdparty_id')->nullable();
                }
                if (! Schema::hasColumn('schedule_requests', 'dolibarr_ticket_id')) {
                    $table->string('dolibarr_ticket_id')->nullable();
                }
            });
        }

        if (Schema::hasTable('payment_receipts')) {
            Schema::table('payment_receipts', function (Blueprint $table) {
                if (! Schema::hasColumn('payment_receipts', 'dolibarr_invoice_id')) {
                    $table->string('dolibarr_invoice_id')->nullable();
                }
                if (! Schema::hasColumn('payment_receipts', 'dolibarr_thirdparty_id')) {
                    $table->string('dolibarr_thirdparty_id')->nullable();
                }
            });
        }
    }
};
