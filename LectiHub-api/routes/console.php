<?php

use App\Services\AuditService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('audit:prune', function (AuditService $audit) {
    $deleted = $audit->pruneExpired();
    $this->info("Pruned {$deleted} audit event(s) outside the retention window.");
})->purpose('Delete audit events older than centre retention settings');

Schedule::command('audit:prune')->daily();
