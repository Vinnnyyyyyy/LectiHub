<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\AnnouncementRecipient;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class AnnouncementController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
    ) {}

    private const AUDIENCES = ['everyone', 'students', 'teachers', 'course', 'people'];

    // -----------------------------------------------------------------------
    // Mappers
    // -----------------------------------------------------------------------

    private function mapAnnouncement(Announcement $a, ?int $recipientCount = null, ?int $readCount = null): array
    {
        $author = $a->author;

        return [
            'id'             => $a->id,
            'subject'        => $a->subject,
            'body'           => $a->body,
            'audienceType'   => $a->audience_type,
            'courseId'       => $a->course_id,
            'course'         => $a->course ? [
                'id'    => $a->course->id,
                'title' => $a->course->title,
            ] : null,
            'sendEmail'      => (bool) $a->send_email,
            'status'         => $a->status,
            'scheduledFor'   => $a->scheduled_for,
            'sentAt'         => $a->sent_at,
            'author'         => $author ? [
                'id'       => $author->id,
                'fullName' => $author->full_name ?: $author->username,
            ] : null,
            'recipientCount' => $recipientCount ?? $a->recipients_count ?? 0,
            'readCount'      => $readCount ?? 0,
            'targetIds'      => $a->relationLoaded('targets') ? $a->targets->pluck('id')->all() : [],
            'createdAt'      => $a->created_at,
        ];
    }

    /** What a recipient sees — the announcement plus their own read state. */
    private function mapReceived(AnnouncementRecipient $r): array
    {
        $a      = $r->announcement;
        $author = $a?->author;

        return [
            'id'             => $a?->id,
            'recipientId'    => $r->id,
            'subject'        => $a?->subject ?? '',
            'body'           => $a?->body ?? '',
            'sentAt'         => $a?->sent_at,
            'isRead'         => $r->read_at !== null,
            'readAt'         => $r->read_at,
            'author'         => $author ? [
                'id'       => $author->id,
                'fullName' => $author->full_name ?: $author->username,
            ] : null,
        ];
    }

    // -----------------------------------------------------------------------
    // Audience resolution
    // -----------------------------------------------------------------------

    /**
     * Everyone who should receive this announcement, as user ids.
     * The author is excluded — nobody needs their own announcement in their inbox.
     */
    private function resolveAudience(Announcement $a): array
    {
        $ids = match ($a->audience_type) {
            'everyone'  => User::whereIn('role', ['student', 'teacher'])->pluck('id')->all(),
            'students'  => User::where('role', 'student')->pluck('id')->all(),
            'teachers'  => User::where('role', 'teacher')->pluck('id')->all(),
            'course'    => $a->course_id
                ? DB::table('course_enrolments')->where('course_id', $a->course_id)->pluck('student_id')->all()
                : [],
            'people'    => $a->targets()->pluck('users.id')->all(),
            default     => [],
        };

        return array_values(array_unique(array_diff($ids, [$a->author_id])));
    }

    /** Preview the reach without sending. */
    public function previewAudience(Request $request): JsonResponse
    {
        $data = $request->validate([
            'audienceType' => ['required', 'string'],
            'courseId'     => ['nullable', 'integer'],
            'userIds'      => ['nullable', 'array'],
            'userIds.*'    => ['integer'],
        ]);

        if (! in_array($data['audienceType'], self::AUDIENCES, true)) {
            return response()->json(['message' => 'Unknown audience.'], 422);
        }

        $stub = new Announcement([
            'audience_type' => $data['audienceType'],
            'course_id'     => $data['courseId'] ?? null,
        ]);
        $stub->author_id = $request->user()?->id;

        if ($data['audienceType'] === 'people') {
            $count = count(array_unique(array_diff($data['userIds'] ?? [], [$stub->author_id])));

            return response()->json(['count' => $count]);
        }

        return response()->json(['count' => count($this->resolveAudience($stub))]);
    }

    // -----------------------------------------------------------------------
    // GET /announcements   (admin: everything they authored / all sent)
    // -----------------------------------------------------------------------

    public function listAnnouncements(Request $request): JsonResponse
    {
        try {
            $items = Announcement::with(['author', 'course', 'targets'])
                ->withCount('recipients')
                ->orderByDesc('created_at')
                ->get();

            $readCounts = DB::table('announcement_recipients')
                ->select('announcement_id', DB::raw('COUNT(*) as c'))
                ->whereNotNull('read_at')
                ->groupBy('announcement_id')
                ->pluck('c', 'announcement_id');

            return response()->json([
                'announcements' => $items->map(
                    fn (Announcement $a) => $this->mapAnnouncement($a, null, (int) ($readCounts[$a->id] ?? 0)),
                )->all(),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to list announcements.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // GET /announcements/mine   (what the signed-in user received)
    // -----------------------------------------------------------------------

    public function listMine(Request $request): JsonResponse
    {
        try {
            $rows = AnnouncementRecipient::with(['announcement.author'])
                ->where('user_id', $request->user()->id)
                ->orderByDesc('created_at')
                ->get()
                // A cascade can leave the join row briefly ahead of the parent.
                ->filter(fn (AnnouncementRecipient $r) => $r->announcement !== null);

            return response()->json([
                'announcements' => $rows->map(fn ($r) => $this->mapReceived($r))->values()->all(),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to list announcements.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /announcements   (admin)
    // -----------------------------------------------------------------------

    public function createAnnouncement(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject'      => ['required', 'string', 'max:200'],
            'body'         => ['required', 'string', 'max:5000'],
            'audienceType' => ['required', 'string'],
            'courseId'     => ['nullable', 'integer', 'exists:courses,id'],
            'userIds'      => ['nullable', 'array'],
            'userIds.*'    => ['integer', 'exists:users,id'],
            'sendEmail'    => ['nullable', 'boolean'],
            'scheduledFor' => ['nullable', 'date'],
            'send'         => ['nullable', 'boolean'],
        ]);

        if (! in_array($data['audienceType'], self::AUDIENCES, true)) {
            return response()->json(['message' => 'Unknown audience.'], 422);
        }
        if ($data['audienceType'] === 'course' && empty($data['courseId'])) {
            return response()->json(['message' => 'Pick a course for a course-targeted announcement.'], 422);
        }

        try {
            $announcement = Announcement::create([
                'author_id'     => $request->user()?->id,
                'subject'       => $data['subject'],
                'body'          => $data['body'],
                'audience_type' => $data['audienceType'],
                'course_id'     => $data['courseId'] ?? null,
                'send_email'    => (bool) ($data['sendEmail'] ?? false),
                'status'        => ! empty($data['scheduledFor']) ? 'scheduled' : 'draft',
                'scheduled_for' => $data['scheduledFor'] ?? null,
            ]);

            if ($data['audienceType'] === 'people' && ! empty($data['userIds'])) {
                $announcement->targets()->sync($data['userIds']);
            }

            // Sending immediately is the common case; scheduling wins if both.
            if (! empty($data['send']) && empty($data['scheduledFor'])) {
                $this->fanOut($announcement);
            }

            $announcement->load(['author', 'course', 'targets'])->loadCount('recipients');

            return response()->json([
                'message'      => $announcement->status === 'sent' ? 'Announcement sent.' : 'Announcement saved.',
                'announcement' => $this->mapAnnouncement($announcement),
            ], 201);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to save announcement.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // POST /announcements/{id}/send   (admin)
    // -----------------------------------------------------------------------

    public function sendAnnouncement(int $id): JsonResponse
    {
        $announcement = Announcement::with('targets')->find($id);
        if (! $announcement) {
            return response()->json(['message' => 'Announcement not found.'], 404);
        }
        if ($announcement->status === 'sent') {
            return response()->json(['message' => 'That announcement has already been sent.'], 422);
        }

        try {
            $count = $this->fanOut($announcement);
            $announcement->load(['author', 'course', 'targets'])->loadCount('recipients');

            return response()->json([
                'message'      => "Sent to {$count} recipient" . ($count === 1 ? '' : 's') . '.',
                'announcement' => $this->mapAnnouncement($announcement),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to send announcement.', 'error' => $e->getMessage()], 500);
        }
    }

    /** Materialises recipient rows and marks the announcement sent. */
    private function fanOut(Announcement $announcement): int
    {
        $ids = $this->resolveAudience($announcement);
        $now = now();

        $rows = array_map(fn (int $userId) => [
            'announcement_id' => $announcement->id,
            'user_id'         => $userId,
            'read_at'         => null,
            'created_at'      => $now,
            'updated_at'      => $now,
        ], $ids);

        if ($rows) {
            // insertOrIgnore keeps a re-send from duplicating the unique pair.
            DB::table('announcement_recipients')->insertOrIgnore($rows);
        }

        $announcement->status  = 'sent';
        $announcement->sent_at = $now;
        $announcement->save();

        $this->audit->record(
            'announcements',
            'announcement.sent',
            "Announcement sent — {$announcement->subject}",
            $announcement->author,
            'announcement',
            $announcement->id,
            ['audience' => $announcement->audience_type, 'recipients' => count($ids)],
        );

        return count($ids);
    }

    // -----------------------------------------------------------------------
    // PATCH /announcements/{id}   (admin — drafts only)
    // -----------------------------------------------------------------------

    public function updateAnnouncement(Request $request, int $id): JsonResponse
    {
        $announcement = Announcement::find($id);
        if (! $announcement) {
            return response()->json(['message' => 'Announcement not found.'], 404);
        }
        if ($announcement->status === 'sent') {
            return response()->json(['message' => 'A sent announcement cannot be edited.'], 422);
        }

        $data = $request->validate([
            'subject'      => ['sometimes', 'string', 'max:200'],
            'body'         => ['sometimes', 'string', 'max:5000'],
            'audienceType' => ['sometimes', 'string'],
            'courseId'     => ['sometimes', 'nullable', 'integer', 'exists:courses,id'],
            'userIds'      => ['sometimes', 'array'],
            'userIds.*'    => ['integer', 'exists:users,id'],
            'sendEmail'    => ['sometimes', 'boolean'],
            'scheduledFor' => ['sometimes', 'nullable', 'date'],
        ]);

        if (isset($data['audienceType']) && ! in_array($data['audienceType'], self::AUDIENCES, true)) {
            return response()->json(['message' => 'Unknown audience.'], 422);
        }

        try {
            if (array_key_exists('subject', $data))      $announcement->subject       = $data['subject'];
            if (array_key_exists('body', $data))         $announcement->body          = $data['body'];
            if (array_key_exists('audienceType', $data)) $announcement->audience_type = $data['audienceType'];
            if (array_key_exists('courseId', $data))     $announcement->course_id     = $data['courseId'];
            if (array_key_exists('sendEmail', $data))    $announcement->send_email    = $data['sendEmail'];
            if (array_key_exists('scheduledFor', $data)) {
                $announcement->scheduled_for = $data['scheduledFor'];
                $announcement->status        = $data['scheduledFor'] ? 'scheduled' : 'draft';
            }
            $announcement->save();

            if (array_key_exists('userIds', $data)) {
                $announcement->targets()->sync($data['userIds']);
            }

            $announcement->load(['author', 'course', 'targets'])->loadCount('recipients');

            return response()->json([
                'message'      => 'Announcement updated.',
                'announcement' => $this->mapAnnouncement($announcement),
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to update announcement.', 'error' => $e->getMessage()], 500);
        }
    }

    // -----------------------------------------------------------------------
    // DELETE /announcements/{id}   (admin)
    // -----------------------------------------------------------------------

    public function deleteAnnouncement(int $id): JsonResponse
    {
        $announcement = Announcement::find($id);
        if (! $announcement) {
            return response()->json(['message' => 'Announcement not found.'], 404);
        }

        $announcement->delete();

        return response()->json(['message' => 'Announcement deleted.']);
    }

    // -----------------------------------------------------------------------
    // PATCH /announcements/{id}/read   (recipient)
    // -----------------------------------------------------------------------

    public function markRead(Request $request, int $id): JsonResponse
    {
        $recipient = AnnouncementRecipient::where('announcement_id', $id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $recipient) {
            return response()->json(['message' => 'That announcement was not sent to you.'], 404);
        }

        if ($recipient->read_at === null) {
            $recipient->read_at = now();
            $recipient->save();
        }

        return response()->json(['message' => 'Marked as read.', 'readAt' => $recipient->read_at]);
    }
}
