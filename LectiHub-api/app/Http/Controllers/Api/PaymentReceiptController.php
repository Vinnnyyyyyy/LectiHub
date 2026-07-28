<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentReceipt;
use App\Models\ScheduleRequest;
use App\Models\User;
use App\Services\DolibarrClient;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class PaymentReceiptController extends Controller
{
    private const METHODS  = ['cash', 'card', 'transfer', 'other'];
    private const STATUSES = ['recorded', 'confirmed', 'void'];

    public function __construct(
        private readonly DolibarrClient      $dolibarr,
        private readonly NotificationService $notifications,
    ) {}

    // -----------------------------------------------------------------------
    // Mapper (mirrors mapReceipt in paymentReceiptController.js)
    // -----------------------------------------------------------------------

    private function mapReceipt(PaymentReceipt $r): array
    {
        $student  = $r->student;
        $recorder = $r->recorder;

        return [
            'id'                   => $r->id,
            'studentId'            => $r->student_id,
            'student'              => [
                'id'       => $r->student_id,
                'username' => $student?->username  ?? '',
                'fullName' => $student?->full_name ?: ($student?->username ?? 'Student'),
                'email'    => $student?->email     ?? '',
            ],
            'recordedById'         => $r->recorded_by,
            'recordedBy'           => $recorder ? [
                'id'       => $r->recorded_by,
                'username' => $recorder->username,
                'fullName' => $recorder->full_name ?: $recorder->username,
            ] : null,
            'amountCents'          => $r->amount_cents,
            'amount'               => round($r->amount_cents / 100, 2),
            'currency'             => $r->currency ?? 'USD',
            'method'               => $r->method,
            'status'               => $r->status,
            'description'          => $r->description ?? '',
            'paidAt'               => $r->paid_at,
            'receiptNumber'        => $r->receipt_number,
            'dolibarrInvoiceId'    => $r->dolibarr_invoice_id    ?? null,
            'dolibarrThirdpartyId' => $r->dolibarr_thirdparty_id ?? null,
            'notes'                => $r->notes ?? '',
            'createdAt'            => $r->created_at,
        ];
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Generate the next sequential receipt number: LH-{year}-{####}
     */
    private function nextReceiptNumber(): string
    {
        $year   = now()->year;
        $prefix = "LH-{$year}-";

        $latest = PaymentReceipt::where('receipt_number', 'like', "{$prefix}%")
            ->orderByDesc('id')
            ->value('receipt_number');

        $seq = 1;
        if ($latest) {
            $parts = explode('-', $latest);
            $n     = (int) end($parts);
            if ($n > 0) {
                $seq = $n + 1;
            }
        }

        return $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Resolve the Dolibarr thirdparty id from the student's most recent
     * schedule request that has one.
     */
    private function resolveDolibarrThirdpartyId(int $studentId): ?string
    {
        return ScheduleRequest::where('student_id', $studentId)
            ->whereNotNull('dolibarr_thirdparty_id')
            ->whereRaw("TRIM(dolibarr_thirdparty_id) != ''")
            ->orderByDesc('id')
            ->value('dolibarr_thirdparty_id');
    }

    /**
     * Parse a dollar amount (as a float-like value from the request) into
     * integer cents.  Returns null when invalid.
     */
    private function parseAmountToCents(mixed $value): ?int
    {
        $amount = (float) $value;
        if (! is_finite($amount) || $amount <= 0 || $amount > 1_000_000) {
            return null;
        }

        return (int) round($amount * 100);
    }

    /**
     * Notify all admins about a new payment receipt.
     */
    private function notifyAdmins(int $receiptId, string $studentName, string $amountLabel): void
    {
        $adminIds = User::where('role', 'admin')->pluck('id')->all();

        $this->notifications->notifyMany(
            userIds: $adminIds,
            type:    'payment_receipt',
            title:   'New student payment receipt',
            message: "{$studentName} submitted a payment receipt for {$amountLabel}.",
            details: ['receiptId' => $receiptId, 'studentName' => $studentName, 'amountLabel' => $amountLabel],
        );
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    /**
     * POST /payment-receipts  (student | admin)
     *
     * Students submit their own receipt; admins may supply studentId to record
     * one on behalf of a student.
     *
     * Body: { amount, method, currency?, description?, notes?, paidAt?, studentId? (admin) }
     * Response 201: { message, receipt, dolibarr }
     */
    public function createPaymentReceipt(Request $request): JsonResponse
    {
        /** @var \App\Models\User $authUser */
        $authUser  = $request->user();
        $role      = $authUser->role;
        $studentId = $authUser->id;

        if ($role === 'admin') {
            $studentId = (int) ($request->input('studentId') ?? 0);
            if ($studentId < 1) {
                return response()->json(['message' => 'studentId is required'], 400);
            }
        } elseif ($role !== 'student') {
            return response()->json(['message' => 'Access denied'], 403);
        }

        /** @var User|null $student */
        $student = User::find($studentId);
        if (! $student || $student->role !== 'student') {
            return response()->json(['message' => 'Student not found'], 400);
        }

        $amountCents = $this->parseAmountToCents($request->input('amount'));
        if ($amountCents === null) {
            return response()->json(['message' => 'Enter a valid payment amount greater than 0.'], 400);
        }

        $method = strtolower(trim((string) ($request->input('method') ?? 'other')));
        if (! in_array($method, self::METHODS, true)) {
            return response()->json(['message' => 'Choose a valid payment method.'], 400);
        }

        $currency    = strtoupper(trim((string) ($request->input('currency') ?? 'USD'))) ?: 'USD';
        $description = mb_substr(trim((string) ($request->input('description') ?? '')), 0, 200);
        $notes       = mb_substr(trim((string) ($request->input('notes')       ?? '')), 0, 500);

        $paidAt = trim((string) ($request->input('paidAt') ?? now()->toDateString()));
        if (! preg_match('/^\d{4}-\d{2}-\d{2}/', $paidAt)) {
            return response()->json(['message' => 'paidAt must be a valid date (YYYY-MM-DD).'], 400);
        }
        $paidAt = substr($paidAt, 0, 10);

        $status        = $role === 'admin' ? 'confirmed' : 'recorded';
        $receiptNumber = $this->nextReceiptNumber();
        $thirdpartyId  = $this->resolveDolibarrThirdpartyId($studentId);

        $receipt = PaymentReceipt::create([
            'student_id'             => $studentId,
            'recorded_by'            => $authUser->id,
            'amount_cents'           => $amountCents,
            'currency'               => $currency,
            'method'                 => $method,
            'status'                 => $status,
            'description'            => $description ?: null,
            'paid_at'                => $paidAt,
            'receipt_number'         => $receiptNumber,
            'dolibarr_thirdparty_id' => $thirdpartyId,
            'notes'                  => $notes ?: null,
        ]);

        // ── Optional Dolibarr invoice ──────────────────────────────────────
        $dolibarr = ['skipped' => true, 'invoiceId' => null, 'error' => null];

        if ($this->dolibarr->isEnabled() && $this->dolibarr->getMode() === 'api' && $thirdpartyId) {
            try {
                $invoiceId = $this->dolibarr->createInvoiceForReceipt(
                    thirdpartyId:  (int) $thirdpartyId,
                    amount:        $amountCents / 100,
                    currency:      $currency,
                    receiptNumber: $receiptNumber,
                    description:   $description ?: "LectiHub payment {$receiptNumber}",
                    paidAt:        $paidAt,
                );

                if ($invoiceId !== null) {
                    $receipt->update(['dolibarr_invoice_id' => (string) $invoiceId]);
                    $dolibarr = ['skipped' => false, 'invoiceId' => (string) $invoiceId, 'error' => null];
                }
            } catch (Throwable $e) {
                $dolibarr = [
                    'skipped'   => false,
                    'invoiceId' => null,
                    'error'     => $e->getMessage() ?: 'Dolibarr invoice create failed',
                ];
            }
        }

        // ── Notify admins when a student submits ──────────────────────────
        if ($role === 'student') {
            $studentName  = $student->full_name ?: $student->username;
            $amountLabel  = "{$currency} " . number_format($amountCents / 100, 2);
            $this->notifyAdmins($receipt->id, $studentName, $amountLabel);
        }

        $receipt->load(['student', 'recorder']);

        $message = $role === 'admin'
            ? 'Payment receipt recorded for the student.'
            : 'Payment receipt submitted. An admin can confirm it in Payments.';

        return response()->json([
            'message'  => $message,
            'receipt'  => $this->mapReceipt($receipt),
            'dolibarr' => $dolibarr,
        ], 201);
    }

    /**
     * GET /payment-receipts  (admin)
     *
     * List all receipts. Optional query filters: status, studentId.
     * Response: { receipts, count }
     */
    public function listPaymentReceipts(Request $request): JsonResponse
    {
        $query = PaymentReceipt::with(['student', 'recorder']);

        $status    = trim((string) ($request->query('status')    ?? ''));
        $studentId = $request->query('studentId') !== null ? (int) $request->query('studentId') : null;

        if ($status && in_array($status, self::STATUSES, true)) {
            $query->where('status', $status);
        }
        if ($studentId !== null && $studentId > 0) {
            $query->where('student_id', $studentId);
        }

        $rows = $query
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($r) => $this->mapReceipt($r))
            ->values()
            ->all();

        return response()->json(['receipts' => $rows, 'count' => count($rows)]);
    }

    /**
     * GET /payment-receipts/my  (student)
     *
     * List the authenticated student's own receipts.
     * Response: { receipts, count }
     */
    public function listMyPaymentReceipts(Request $request): JsonResponse
    {
        /** @var \App\Models\User $authUser */
        $authUser = $request->user();

        $rows = PaymentReceipt::with(['student', 'recorder'])
            ->where('student_id', $authUser->id)
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($r) => $this->mapReceipt($r))
            ->values()
            ->all();

        return response()->json(['receipts' => $rows, 'count' => count($rows)]);
    }

    /**
     * GET /payment-receipts/{id}  (admin | owner student)
     *
     * Fetch a single receipt.  Students may only view their own.
     * Response: { receipt }
     */
    public function getPaymentReceipt(Request $request, int $id): JsonResponse
    {
        if ($id < 1) {
            return response()->json(['message' => 'Invalid receipt id'], 400);
        }

        /** @var PaymentReceipt|null $receipt */
        $receipt = PaymentReceipt::with(['student', 'recorder'])->find($id);
        if (! $receipt) {
            return response()->json(['message' => 'Payment receipt not found'], 404);
        }

        /** @var \App\Models\User $authUser */
        $authUser = $request->user();
        if ($authUser->role !== 'admin' && $receipt->student_id !== $authUser->id) {
            return response()->json(['message' => 'Access denied'], 403);
        }

        return response()->json(['receipt' => $this->mapReceipt($receipt)]);
    }

    /**
     * PATCH /payment-receipts/{id}/status  (admin)
     *
     * Update the status of a receipt (recorded → confirmed | void, etc.).
     * Body: { status }
     * Response: { message, receipt }
     */
    public function updatePaymentReceiptStatus(Request $request, int $id): JsonResponse
    {
        if ($id < 1) {
            return response()->json(['message' => 'Invalid receipt id'], 400);
        }

        $status = strtolower(trim((string) ($request->input('status') ?? '')));
        if (! in_array($status, self::STATUSES, true)) {
            return response()->json(
                ['message' => 'status must be recorded, confirmed, or void'],
                400
            );
        }

        /** @var PaymentReceipt|null $receipt */
        $receipt = PaymentReceipt::with(['student', 'recorder'])->find($id);
        if (! $receipt) {
            return response()->json(['message' => 'Payment receipt not found'], 404);
        }

        $receipt->update(['status' => $status]);
        $receipt->refresh();

        return response()->json([
            'message' => "Receipt marked as {$status}.",
            'receipt' => $this->mapReceipt($receipt),
        ]);
    }
}
